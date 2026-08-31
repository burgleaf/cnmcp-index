import { classifyKind, inferPlatforms, type DiscoveryKind } from "../classify";
import {
  asNonNegativeInteger,
  asString,
  GITHUB_API,
  githubHeaders,
  parseGithubRepo,
  readRecord,
  readStringArray,
} from "../github";
import { computeScore } from "../score";
import type { CandidateRecord } from "../types";
import type { FetchLike } from "./mcp-registry";

export type SearchQuery = Readonly<{
  id: string;
  q: string;
  hint: DiscoveryKind;
}>;

export const GITHUB_SEARCH_QUERIES: ReadonlyArray<SearchQuery> = [
  { id: "mcp-server", q: "topic:mcp-server stars:>=30", hint: "mcp" },
  { id: "mcp-topic", q: "topic:mcp stars:>=50", hint: "mcp" },
  { id: "claude-code", q: "topic:claude-code stars:>=10", hint: "plugin" },
  { id: "openai-codex", q: "topic:openai-codex stars:>=5", hint: "plugin" },
  { id: "codex-plugin", q: "codex plugin stars:>=10", hint: "plugin" },
  { id: "claude-skill", q: "topic:claude-skill stars:>=5", hint: "skill" },
];

export type GithubSleep = (ms: number) => Promise<void>;

function licenseFromRepo(record: Record<string, unknown>): string | null {
  const license = readRecord(record.license);
  const spdx = asString(license?.spdx_id);
  if (spdx && spdx !== "NOASSERTION") return spdx;
  return asString(license?.name) || null;
}

export function candidateFromGithubRepo(
  raw: unknown,
  hint: DiscoveryKind,
  extraSources: ReadonlyArray<string>,
  now: number,
): CandidateRecord | null {
  const record = readRecord(raw);
  if (!record) return null;
  const parsed = parseGithubRepo(asString(record.html_url) || asString(record.full_name));
  if (!parsed) return null;
  const name = asString(record.name) || parsed.repo;
  const description = asString(record.description).slice(0, 500);
  const topics = readStringArray(record.topics);
  const sources = [...new Set(["github-search", ...extraSources])];
  const kind = classifyKind({ name, description, topics, sources, hint });
  const stars = asNonNegativeInteger(record.stargazers_count);
  const forks = asNonNegativeInteger(record.forks_count);
  const pushedAt = asString(record.pushed_at) || null;
  return {
    repoFullName: parsed.fullName,
    htmlUrl: parsed.htmlUrl,
    name: name.slice(0, 160),
    description,
    stars,
    forks,
    language: asString(record.language) || null,
    license: licenseFromRepo(record),
    topics,
    kind,
    inferredPlatforms: inferPlatforms({ name, description, topics, sources }),
    score: computeScore({ stars, forks, pushedAt, sources, kind, now }),
    pushedAt,
    sources,
  };
}

export async function searchGithubRepositories(
  fetchImpl: FetchLike,
  token: string,
  query: SearchQuery,
  pages: number,
  perKindLimit: number,
  now: number,
  sleep: GithubSleep,
): Promise<CandidateRecord[]> {
  const collected: CandidateRecord[] = [];
  const maxPages = Math.max(1, Math.min(pages, 2));
  for (let page = 1; page <= maxPages && collected.length < perKindLimit; page += 1) {
    if (page > 1) await sleep(2_500);
    const url = new URL(`${GITHUB_API}/search/repositories`);
    url.searchParams.set("q", query.q);
    url.searchParams.set("sort", "stars");
    url.searchParams.set("order", "desc");
    url.searchParams.set("per_page", "50");
    url.searchParams.set("page", String(page));
    const response = await fetchImpl(url.toString(), { headers: githubHeaders(token) });
    if (response.status === 403 || response.status === 429) throw new Error(`GitHub Search rate limited HTTP ${response.status}`);
    if (!response.ok) throw new Error(`GitHub Search HTTP ${response.status}`);
    const payload = readRecord(await response.json());
    const items = Array.isArray(payload?.items) ? payload.items : [];
    for (const item of items) {
      const candidate = candidateFromGithubRepo(item, query.hint, [], now);
      if (!candidate) continue;
      if (collected.some((entry) => entry.repoFullName === candidate.repoFullName)) continue;
      collected.push(candidate);
      if (collected.length >= perKindLimit) break;
    }
    if (items.length === 0) break;
  }
  return collected;
}

export async function enrichGithubRepo(
  fetchImpl: FetchLike,
  token: string,
  fullName: string,
  now: number,
): Promise<CandidateRecord | null> {
  const parsed = parseGithubRepo(`https://github.com/${fullName}`);
  if (!parsed) return null;
  const response = await fetchImpl(`${GITHUB_API}/repos/${parsed.owner}/${parsed.repo}`, {
    headers: githubHeaders(token),
  });
  if (!response.ok) return null;
  return candidateFromGithubRepo(await response.json(), "unknown", ["mcp-registry"], now);
}
