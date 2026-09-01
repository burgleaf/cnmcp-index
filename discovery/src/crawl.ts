import { classifyKind, inferPlatforms, isIndexedKind, type ResourceKind } from "./classify";
import {
  catalogMapFromMatches,
  emptyCrawlStats,
  finishCrawlRun,
  listPromotionCandidates,
  markIssued,
  pruneStaleCandidates,
  recordSkippedPromotions,
  startCrawlRun,
  updateCrawlRunIssued,
  upsertCandidates,
} from "./db";
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

export type IngestResult = Readonly<{
  candidates: CandidateRecord[];
  stats: Pick<CrawlStats, "registry" | "github">;
}>;

const WORKFLOW_CONFLICT = /already exists|already running|instance with id/i;
const RETRYABLE_WORKFLOW_STATUS = new Set(["errored", "terminated"]);
const ACTIVE_OR_DONE_STATUS = new Set([
  "queued",
  "running",
  "paused",
  "waiting",
  "waitingForPause",
  "complete",
]);

function parseIntegerSetting(value: string, minimum: number, maximum: number, fallback: number): number {
  if (!/^\d+$/.test(value)) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) return fallback;
  return parsed;
}

function isConflictError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return WORKFLOW_CONFLICT.test(message);
}

async function readWorkflowStatus(env: WorkerEnv, id: string): Promise<string | null> {
  try {
    const instance = await env.DISCOVERY_WORKFLOW.get(id);
    const snapshot = await instance.status();
    return snapshot.status;
  } catch {
    return null;
  }
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
      });
      const stars = Math.max(existing.stars, candidate.stars);
      const forks = Math.max(existing.forks, candidate.forks);
      const pushedAt = [existing.pushedAt, candidate.pushedAt].filter(Boolean).sort().at(-1) ?? null;
      const name = existing.name || candidate.name;
      const description = existing.description || candidate.description;
      const next: CandidateRecord = {
        repoFullName: existing.repoFullName,
        htmlUrl: existing.htmlUrl,
        name,
        description,
        stars,
        forks,
        language: existing.language ?? candidate.language,
        license: existing.license ?? candidate.license,
        topics,
        kind,
        inferredPlatforms: inferPlatforms({ name, description, topics, sources }),
        score: 0,
        pushedAt,
        sources,
      };
      next.score = computeScore({ stars, forks, pushedAt, sources, kind, now });
      merged.set(candidate.repoFullName, next);
    }
  }
  return [...merged.values()].filter((item): item is CandidateRecord & { kind: ResourceKind } => isIndexedKind(item.kind));
}

export function selectPersistedCandidates(
  candidates: ReadonlyArray<CandidateRecord>,
  options: Readonly<{ minStars: number; perKindLimit: number }>,
): CandidateRecord[] {
  const minStars = Math.max(1, options.minStars);
  const perKindLimit = Math.max(0, options.perKindLimit);
  const ranked = [...candidates]
    .filter((item) => isIndexedKind(item.kind) && item.stars >= minStars)
    .sort((left, right) => right.score - left.score || right.repoFullName.localeCompare(left.repoFullName));
  const taken: Record<ResourceKind, number> = { mcp: 0, skill: 0, plugin: 0 };
  const selected: CandidateRecord[] = [];
  for (const item of ranked) {
    if (!isIndexedKind(item.kind)) continue;
    if (taken[item.kind] >= perKindLimit) continue;
    taken[item.kind] += 1;
    selected.push(item);
  }
  return selected;
}

export async function ingestCandidates(env: WorkerEnv, runtime: CrawlRuntime): Promise<IngestResult> {
  const kindLimit = parseIntegerSetting(env.SOURCE_KIND_LIMIT, 10, 200, 80);
  const searchPages = parseIntegerSetting(env.SEARCH_PAGES_PER_QUERY, 1, 2, 1);
  const token = env.GITHUB_TOKEN?.trim();

  const registry = await fetchMcpRegistry(runtime.fetch, kindLimit, runtime.now);
  const githubGroups: CandidateRecord[][] = [];
  if (token) {
    for (const query of GITHUB_SEARCH_QUERIES) {
      await runtime.sleep(2_500);
      githubGroups.push(
        await searchGithubRepositories(runtime.fetch, token, query, searchPages, kindLimit, runtime.now, runtime.sleep),
      );
    }
  }
  let merged = mergeCandidates([registry, githubGroups.flat()], runtime.now);
  if (token) {
    const needsEnrich = merged.filter((item) => item.stars === 0 && item.sources.includes("mcp-registry")).slice(0, 20);
    for (const item of needsEnrich) {
      await runtime.sleep(1_200);
      const enriched = await enrichGithubRepo(runtime.fetch, token, item.repoFullName, runtime.now);
      if (enriched) merged = mergeCandidates([merged, [enriched]], runtime.now);
    }
  }
  return {
    candidates: merged,
    stats: { registry: registry.length, github: githubGroups.flat().length },
  };
}

export async function persistSnapshot(
  env: WorkerEnv,
  runtime: CrawlRuntime,
  candidates: ReadonlyArray<CandidateRecord>,
  ingestStats: Pick<CrawlStats, "registry" | "github">,
): Promise<Pick<CrawlStats, "upserted" | "catalogMatched">> {
  const crawlDate = new Date(runtime.now).toISOString().slice(0, 10);
  await startCrawlRun(env.DB, crawlDate, runtime.now);
  const stats: CrawlStats = { ...emptyCrawlStats(), ...ingestStats };
  try {
    const perKindLimit = parseIntegerSetting(env.PERSIST_PER_KIND_LIMIT, 10, 80, 40);
    const catalogMatches = await loadCatalogMatches(runtime.fetch, env.CATALOG_JSON_URL);
    const catalogMap = catalogMapFromMatches(catalogMatches);
    stats.catalogMatched = catalogMap.size;
    const persisted = selectPersistedCandidates(candidates, { minStars: 1, perKindLimit });
    stats.upserted = await upsertCandidates(env.DB, persisted, catalogMap, runtime.now);
    await recordSkippedPromotions(env.DB, persisted, catalogMap, runtime.now);
    await pruneStaleCandidates(env.DB, runtime.now);
    await finishCrawlRun(env.DB, crawlDate, runtime.now, "succeeded", stats);
    return { upserted: stats.upserted, catalogMatched: stats.catalogMatched };
  } catch (error) {
    await finishCrawlRun(env.DB, crawlDate, runtime.now, "failed", stats);
    throw error;
  }
}

export async function promoteNewCandidates(env: WorkerEnv, runtime: CrawlRuntime): Promise<number> {
  const token = env.GITHUB_TOKEN?.trim();
  const maxIssues = parseIntegerSetting(env.PROMOTION_MAX_ISSUES_PER_CRAWL, 0, 20, 5);
  const minStars = parseIntegerSetting(env.PROMOTION_MIN_STARS, 1, 10_000, 50);
  if (!token || maxIssues === 0) return 0;
  const promotions = await listPromotionCandidates(env.DB, minStars, maxIssues);
  let issued = 0;
  for (const candidate of promotions) {
    await runtime.sleep(1_000);
    const issueNumber = await createGithubIssue(runtime.fetch, token, env.CATALOG_REPOSITORY, candidate);
    if (issueNumber) {
      await markIssued(env.DB, candidate.repoFullName, issueNumber, runtime.now);
      issued += 1;
    }
  }
  const crawlDate = new Date(runtime.now).toISOString().slice(0, 10);
  await updateCrawlRunIssued(env.DB, crawlDate, issued);
  return issued;
}

export async function runDiscoveryCrawl(env: WorkerEnv, runtime: CrawlRuntime): Promise<CrawlStats> {
  const ingested = await ingestCandidates(env, runtime);
  const persisted = await persistSnapshot(env, runtime, ingested.candidates, ingested.stats);
  const issued = await promoteNewCandidates(env, runtime);
  return { ...ingested.stats, ...persisted, issued };
}

export async function startDailyCrawl(env: WorkerEnv, now = Date.now()): Promise<"started" | "already"> {
  const crawlDate = new Date(now).toISOString().slice(0, 10);
  const baseId = `crawl-${crawlDate}`;
  const status = await readWorkflowStatus(env, baseId);
  const params = { crawlDate, now };

  if (status && ACTIVE_OR_DONE_STATUS.has(status)) return "already";

  const instanceId = status && RETRYABLE_WORKFLOW_STATUS.has(status) ? `${baseId}-retry-${now}` : baseId;
  try {
    await env.DISCOVERY_WORKFLOW.create({ id: instanceId, params });
    return "started";
  } catch (error) {
    if (isConflictError(error)) return "already";
    throw error;
  }
}
