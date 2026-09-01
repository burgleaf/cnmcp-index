import { RESOURCE_KINDS, type ResourceKind } from "./classify";
import type { DiscoveryItem, DiscoveryListQuery } from "./protocol";
import type { CandidateRecord, CrawlStats, StoredCandidate } from "./types";

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
  kind: ResourceKind;
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

const INDEXED_KIND_LIST = RESOURCE_KINDS.map((kind) => `'${kind}'`).join(", ");

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

const LIST_COLUMNS =
  "repo_full_name, html_url, name, description, stars, kind, inferred_platforms, score, pushed_at, catalog_id";

export async function listDiscoveryItems(db: D1Database, query: DiscoveryListQuery): Promise<DiscoveryItem[]> {
  const kindFilter = query.kind
    ? `kind = ?1 AND kind IN (${INDEXED_KIND_LIST}) AND stars >= 1`
    : `kind IN (${INDEXED_KIND_LIST}) AND stars >= 1`;
  const sql = `SELECT ${LIST_COLUMNS} FROM candidates WHERE ${kindFilter} ORDER BY ${orderClause(query.sort)} LIMIT ?${query.kind ? 2 : 1} OFFSET ?${query.kind ? 3 : 2}`;
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
    return db
      .prepare(
        `INSERT INTO candidates (
           repo_full_name, html_url, name, description, stars, forks, language, license,
           topics, kind, inferred_platforms, score, pushed_at, sources, catalog_id,
           promotion_status, issue_number, first_seen_at, last_crawled_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, 'none', NULL, ?16, ?16)
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
        now,
      );
  });
  await db.batch(statements);
  return candidates.length;
}

export async function recordSkippedPromotions(
  db: D1Database,
  candidates: ReadonlyArray<CandidateRecord>,
  catalogByRepo: ReadonlyMap<string, string>,
  now: number,
): Promise<void> {
  const skipped = candidates.flatMap((candidate) => {
    const catalogId = catalogByRepo.get(candidate.repoFullName);
    return catalogId ? [{ repoFullName: candidate.repoFullName, catalogId }] : [];
  });
  if (skipped.length === 0) return;
  await db.batch(
    skipped.map((item) =>
      db
        .prepare(
          `INSERT INTO promotions (repo_full_name, status, issue_number, catalog_id, updated_at)
           VALUES (?1, 'skipped', NULL, ?2, ?3)
           ON CONFLICT(repo_full_name) DO NOTHING`,
        )
        .bind(item.repoFullName, item.catalogId, now),
    ),
  );
}

export async function listPromotionCandidates(
  db: D1Database,
  minStars: number,
  limit: number,
): Promise<StoredCandidate[]> {
  const result = await db
    .prepare(
      `SELECT c.repo_full_name, c.html_url, c.name, c.description, c.stars, c.forks, c.language, c.license,
              c.topics, c.kind, c.inferred_platforms, c.score, c.pushed_at, c.sources, c.catalog_id,
              c.promotion_status, c.issue_number, c.first_seen_at, c.last_crawled_at
       FROM candidates c
       LEFT JOIN promotions p ON p.repo_full_name = c.repo_full_name
       WHERE p.repo_full_name IS NULL
         AND c.catalog_id IS NULL
         AND c.kind IN (${INDEXED_KIND_LIST})
         AND c.stars >= ?1
       ORDER BY c.score DESC, c.repo_full_name DESC
       LIMIT ?2`,
    )
    .bind(minStars, limit)
    .all<CandidateRow>();
  return result.results.map(toStored);
}

export async function markIssued(db: D1Database, repoFullName: string, issueNumber: number, now: number): Promise<void> {
  await db
    .prepare(
      `INSERT INTO promotions (repo_full_name, status, issue_number, catalog_id, updated_at)
       VALUES (?1, 'issued', ?2, NULL, ?3)
       ON CONFLICT(repo_full_name) DO UPDATE SET
         status = 'issued',
         issue_number = excluded.issue_number,
         updated_at = excluded.updated_at`,
    )
    .bind(repoFullName, issueNumber, now)
    .run();
}

export async function pruneStaleCandidates(db: D1Database, now: number): Promise<void> {
  await db
    .prepare(`DELETE FROM candidates WHERE last_crawled_at < ?1 OR stars < 1 OR kind NOT IN (${INDEXED_KIND_LIST})`)
    .bind(now)
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

export async function latestSuccessfulCrawlFinishedAt(db: D1Database): Promise<number | null> {
  const row = await db
    .prepare(
      `SELECT finished_at FROM crawl_runs
       WHERE status = 'succeeded' AND finished_at IS NOT NULL
       ORDER BY finished_at DESC LIMIT 1`,
    )
    .first<{ finished_at: number }>();
  return typeof row?.finished_at === "number" ? row.finished_at : null;
}

export async function updateCrawlRunIssued(db: D1Database, crawlDate: string, issued: number): Promise<void> {
  const row = await db.prepare(`SELECT stats FROM crawl_runs WHERE crawl_date = ?1`).bind(crawlDate).first<{ stats: string }>();
  const stats = parseStats(row?.stats);
  stats.issued = issued;
  await db.prepare(`UPDATE crawl_runs SET stats = ?2 WHERE crawl_date = ?1`).bind(crawlDate, JSON.stringify(stats)).run();
}

function parseStats(value: string | undefined): Record<string, number> {
  try {
    const parsed = JSON.parse(value ?? "{}") as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, number] => typeof entry[1] === "number"),
    );
  } catch {
    return {};
  }
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

export function emptyCrawlStats(): CrawlStats {
  return { registry: 0, github: 0, upserted: 0, catalogMatched: 0, issued: 0 };
}
