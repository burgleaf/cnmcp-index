import { classifyKind, inferPlatforms } from "./classify";
import { catalogMapFromMatches, finishCrawlRun, listPromotionCandidates, markIssued, startCrawlRun, upsertCandidates } from "./db";
import { computeScore } from "./score";
import { loadCatalogMatches } from "./sources/catalog";
import { enrichGithubRepo, GITHUB_SEARCH_QUERIES, searchGithubRepositories } from "./sources/github-search";
import { fetchMcpRegistry, type FetchLike } from "./sources/mcp-registry";
import type { CandidateRecord, CrawlStats } from "./types";
import { createGithubIssue } from "./promote";

export type CrawlRuntime = Readonly<{
  fetch: FetchLike;
  sleep: (ms: number) => Promise<void>;
  now: number;
}>;

function parseIntegerSetting(value: string, minimum: number, maximum: number, fallback: number): number {
  if (!/^\d+$/.test(value)) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) return fallback;
  return parsed;
}

export function mergeCandidates(groups: ReadonlyArray<ReadonlyArray<CandidateRecord>>, now: number): CandidateRecord[] {
  const merged = new Map<string, CandidateRecord>();
  for (const group of groups) {
    for (const candidate of group) {
      const existing = merged.get(candidate.repoFullName);
      if (!existing) {
        merged.set(candidate.repoFullName, candidate);
        continue;
      }
      const sources = [...new Set([...existing.sources, ...candidate.sources])];
      const topics = [...new Set([...existing.topics, ...candidate.topics])];
      const kind = classifyKind({
        name: candidate.name || existing.name,
        description: candidate.description || existing.description,
        topics,
        sources,
        hint: existing.kind !== "unknown" ? existing.kind : candidate.kind,
      });
      const stars = Math.max(existing.stars, candidate.stars);
      const forks = Math.max(existing.forks, candidate.forks);
      const pushedAt = [existing.pushedAt, candidate.pushedAt].filter(Boolean).sort().at(-1) ?? null;
      const next: CandidateRecord = {
        repoFullName: existing.repoFullName,
        htmlUrl: existing.htmlUrl,
        name: existing.name || candidate.name,
        description: existing.description || candidate.description,
        stars,
        forks,
        language: existing.language ?? candidate.language,
        license: existing.license ?? candidate.license,
        topics,
        kind,
        inferredPlatforms: inferPlatforms({
          name: existing.name || candidate.name,
          description: existing.description || candidate.description,
          topics,
          sources,
        }),
        score: 0,
        pushedAt,
        sources,
      };
      next.score = computeScore({ stars, forks, pushedAt, sources, kind, now });
      merged.set(candidate.repoFullName, next);
    }
  }
  return [...merged.values()];
}

export async function runDiscoveryCrawl(env: WorkerEnv, runtime: CrawlRuntime): Promise<CrawlStats> {
  const crawlDate = new Date(runtime.now).toISOString().slice(0, 10);
  await startCrawlRun(env.DB, crawlDate, runtime.now);
  const stats: CrawlStats = { registry: 0, github: 0, upserted: 0, catalogMatched: 0, issued: 0 };
  try {
    const kindLimit = parseIntegerSetting(env.SOURCE_KIND_LIMIT, 10, 200, 80);
    const searchPages = parseIntegerSetting(env.SEARCH_PAGES_PER_QUERY, 1, 3, 2);
    const minStars = parseIntegerSetting(env.PROMOTION_MIN_STARS, 1, 10_000, 50);
    const maxIssues = parseIntegerSetting(env.PROMOTION_MAX_ISSUES_PER_CRAWL, 0, 20, 5);
    const token = env.GITHUB_TOKEN?.trim();

    const registry = await fetchMcpRegistry(runtime.fetch, kindLimit, runtime.now);
    stats.registry = registry.length;

    const githubGroups: CandidateRecord[][] = [];
    if (token) {
      for (const query of GITHUB_SEARCH_QUERIES) {
        await runtime.sleep(2_500);
        githubGroups.push(
          await searchGithubRepositories(runtime.fetch, token, query, searchPages, kindLimit, runtime.now, runtime.sleep),
        );
      }
    }
    const github = githubGroups.flat();
    stats.github = github.length;

    let merged = mergeCandidates([registry, github], runtime.now);
    if (token) {
      const needsEnrich = merged.filter((item) => item.stars === 0 && item.sources.includes("mcp-registry")).slice(0, 40);
      for (const item of needsEnrich) {
        await runtime.sleep(1_200);
        const enriched = await enrichGithubRepo(runtime.fetch, token, item.repoFullName, runtime.now);
        if (enriched) merged = mergeCandidates([merged, [enriched]], runtime.now);
      }
    }

    const catalogMatches = token
      ? await loadCatalogMatches(runtime.fetch, token, env.CATALOG_REPOSITORY)
      : [];
    const catalogMap = catalogMapFromMatches(catalogMatches);
    stats.catalogMatched = catalogMap.size;
    stats.upserted = await upsertCandidates(env.DB, merged, catalogMap, runtime.now);

    if (token && maxIssues > 0) {
      const promotions = await listPromotionCandidates(env.DB, minStars, maxIssues);
      for (const candidate of promotions) {
        await runtime.sleep(1_000);
        const issueNumber = await createGithubIssue(runtime.fetch, token, env.CATALOG_REPOSITORY, candidate);
        if (issueNumber) {
          await markIssued(env.DB, candidate.repoFullName, issueNumber);
          stats.issued += 1;
        }
      }
    }

    await finishCrawlRun(env.DB, crawlDate, Date.now(), "succeeded", stats);
    return stats;
  } catch (error) {
    await finishCrawlRun(env.DB, crawlDate, Date.now(), "failed", stats);
    throw error;
  }
}

export async function startDailyCrawl(env: WorkerEnv, now = Date.now()): Promise<"started" | "already"> {
  const crawlDate = new Date(now).toISOString().slice(0, 10);
  try {
    await env.DISCOVERY_WORKFLOW.create({
      id: `crawl-${crawlDate}`,
      params: { crawlDate, now },
    });
    return "started";
  } catch {
    return "already";
  }
}
