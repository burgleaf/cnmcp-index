import type { DiscoveryKind } from "./classify";
import type { DiscoveryItem, DiscoveryListQuery } from "./protocol";
import type { CandidateRecord, StoredCandidate } from "./types";

type CandidateRow = {
  repo_full_name: string;
  html_url: string;
  name: string;
  description: string;
  stars: number;
  forks: number;
  language: string | null;
  license: string | null;
  topics: string;
  kind: DiscoveryKind;
  inferred_platforms: string;
  score: number;
  pushed_at: string | null;
  sources: string;
  catalog_id: string | null;
  promotion_status: "none" | "issued" | "skipped";
  issue_number: number | null;
  first_seen_at: number;
  last_crawled_at: number;
};

function parseJsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function toItem(row: CandidateRow): DiscoveryItem {
  return {
    repoFullName: row.repo_full_name,
    htmlUrl: row.html_url,
    name: row.name,
    description: row.description,
    stars: row.stars,
    kind: row.kind,
    inferredPlatforms: parseJsonArray(row.inferred_platforms),
    score: row.score,
    pushedAt: row.pushed_at,
    catalogId: row.catalog_id,
  };
}

export function toStored(row: CandidateRow): StoredCandidate {
  return {
    repoFullName: row.repo_full_name,
    htmlUrl: row.html_url,
    name: row.name,
    description: row.description,
    stars: row.stars,
    forks: row.forks,
    language: row.language,
    license: row.license,
    topics: parseJsonArray(row.topics),
    kind: row.kind,
    inferredPlatforms: parseJsonArray(row.inferred_platforms),
    score: row.score,
    pushedAt: row.pushed_at,
    sources: parseJsonArray(row.sources),
    catalogId: row.catalog_id,
    promotionStatus: row.promotion_status,
    issueNumber: row.issue_number,
    firstSeenAt: row.first_seen_at,
    lastCrawledAt: row.last_crawled_at,
  };
}

function orderClause(sort: DiscoveryListQuery["sort"]): string {
  if (sort === "stars") return "stars DESC, repo_full_name DESC";
  if (sort === "recent") return "pushed_at DESC, repo_full_name DESC";
  return "score DESC, repo_full_name DESC";
}

export async function listDiscoveryItems(db: D1Database, query: DiscoveryListQuery): Promise<DiscoveryItem[]> {
  const sql = query.kind
    ? `SELECT * FROM candidates WHERE kind = ?1 ORDER BY ${orderClause(query.sort)} LIMIT ?2 OFFSET ?3`
    : `SELECT * FROM candidates ORDER BY ${orderClause(query.sort)} LIMIT ?1 OFFSET ?2`;
  const statement = query.kind
    ? db.prepare(sql).bind(query.kind, query.limit, query.offset)
    : db.prepare(sql).bind(query.limit, query.offset);
  const result = await statement.all<CandidateRow>();
  return result.results.map(toItem);
}

export async function upsertCandidates(
  db: D1Database,
  candidates: ReadonlyArray<CandidateRecord>,
  catalogByRepo: ReadonlyMap<string, string>,
  now: number,
): Promise<number> {
  if (candidates.length === 0) return 0;
  const statements = candidates.map((candidate) => {
    const catalogId = catalogByRepo.get(candidate.repoFullName) ?? null;
    const promotionStatus = catalogId ? "skipped" : "none";
    return db
      .prepare(
        `INSERT INTO candidates (
           repo_full_name, html_url, name, description, stars, forks, language, license,
           topics, kind, inferred_platforms, score, pushed_at, sources, catalog_id,
           promotion_status, issue_number, first_seen_at, last_crawled_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, NULL, ?17, ?17)
         ON CONFLICT(repo_full_name) DO UPDATE SET
           html_url = excluded.html_url,
           name = excluded.name,
           description = excluded.description,
           stars = excluded.stars,
           forks = excluded.forks,
           language = excluded.language,
           license = excluded.license,
           topics = excluded.topics,
           kind = excluded.kind,
           inferred_platforms = excluded.inferred_platforms,
           score = excluded.score,
           pushed_at = excluded.pushed_at,
           sources = excluded.sources,
           catalog_id = excluded.catalog_id,
           promotion_status = CASE
             WHEN candidates.promotion_status IN ('issued', 'skipped') THEN candidates.promotion_status
             ELSE excluded.promotion_status
           END,
           last_crawled_at = excluded.last_crawled_at`,
      )
      .bind(
        candidate.repoFullName,
        candidate.htmlUrl,
        candidate.name,
        candidate.description,
        candidate.stars,
        candidate.forks,
        candidate.language,
        candidate.license,
        JSON.stringify(candidate.topics),
        candidate.kind,
        JSON.stringify(candidate.inferredPlatforms),
        candidate.score,
        candidate.pushedAt,
        JSON.stringify(candidate.sources),
        catalogId,
        promotionStatus,
        now,
      );
  });
  await db.batch(statements);
  return candidates.length;
}

export async function listPromotionCandidates(
  db: D1Database,
  minStars: number,
  limit: number,
): Promise<StoredCandidate[]> {
  const result = await db
    .prepare(
      `SELECT * FROM candidates
       WHERE promotion_status = 'none'
         AND catalog_id IS NULL
         AND kind IN ('mcp', 'skill', 'plugin')
         AND stars >= ?1
       ORDER BY score DESC, repo_full_name DESC
       LIMIT ?2`,
    )
    .bind(minStars, limit)
    .all<CandidateRow>();
  return result.results.map(toStored);
}

export async function markIssued(db: D1Database, repoFullName: string, issueNumber: number): Promise<void> {
  await db
    .prepare(
      `UPDATE candidates SET promotion_status = 'issued', issue_number = ?2 WHERE repo_full_name = ?1 AND promotion_status = 'none'`,
    )
    .bind(repoFullName, issueNumber)
    .run();
}

export async function startCrawlRun(db: D1Database, crawlDate: string, now: number): Promise<void> {
  await db
    .prepare(
      `INSERT INTO crawl_runs (crawl_date, started_at, finished_at, status, stats)
       VALUES (?1, ?2, NULL, 'running', '{}')
       ON CONFLICT(crawl_date) DO UPDATE SET started_at = excluded.started_at, finished_at = NULL, status = 'running', stats = '{}'`,
    )
    .bind(crawlDate, now)
    .run();
}

export async function finishCrawlRun(
  db: D1Database,
  crawlDate: string,
  now: number,
  status: "succeeded" | "failed",
  stats: Record<string, number>,
): Promise<void> {
  await db
    .prepare(`UPDATE crawl_runs SET finished_at = ?2, status = ?3, stats = ?4 WHERE crawl_date = ?1`)
    .bind(crawlDate, now, status, JSON.stringify(stats))
    .run();
}

export function catalogMapFromMatches(
  matches: ReadonlyArray<{ resourceId: string; fullName: string | null }>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const match of matches) {
    if (match.fullName) map.set(match.fullName, match.resourceId);
  }
  return map;
}
