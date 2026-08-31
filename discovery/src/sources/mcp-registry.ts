import { classifyKind, inferPlatforms } from "../classify";
import { asNonNegativeInteger, asString, parseGithubRepo, readRecord, readStringArray } from "../github";
import { computeScore } from "../score";
import type { CandidateRecord } from "../types";

const REGISTRY_URL = "https://registry.modelcontextprotocol.io/v0.1/servers";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

function extractRepositoryUrl(entry: Record<string, unknown>): string | null {
  const server = readRecord(entry.server) ?? entry;
  const repository = readRecord(server.repository);
  const fromRepository = asString(repository?.url) || asString(repository?.web) || asString(server.repository);
  const website = asString(server.websiteUrl) || asString(server.homepage);
  const meta = readRecord(entry._meta);
  const official = readRecord(meta?.["io.modelcontextprotocol.registry/official"]);
  const fromMeta = asString(official?.repository) || asString(meta?.github);
  return fromRepository || website || fromMeta || null;
}

export async function fetchMcpRegistry(
  fetchImpl: FetchLike,
  limit: number,
  now: number,
): Promise<CandidateRecord[]> {
  const collected: CandidateRecord[] = [];
  let cursor: string | null = null;
  let pages = 0;

  while (collected.length < limit && pages < 8) {
    const url = new URL(REGISTRY_URL);
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("cursor", cursor);
    const response = await fetchImpl(url.toString(), {
      headers: { Accept: "application/json", "User-Agent": "cnmcp-discovery/0.1" },
    });
    if (!response.ok) throw new Error(`MCP Registry HTTP ${response.status}`);
    const payload = (await response.json()) as unknown;
    const root = readRecord(payload);
    if (!root) break;
    const servers = Array.isArray(root.servers) ? root.servers : [];
    for (const raw of servers) {
      const entry = readRecord(raw);
      if (!entry) continue;
      const server = readRecord(entry.server) ?? entry;
      const parsed = parseGithubRepo(extractRepositoryUrl(entry));
      if (!parsed) continue;
      if (collected.some((item) => item.repoFullName === parsed.fullName)) continue;
      const description = asString(server.description).slice(0, 500);
      const name = asString(server.title) || asString(server.name) || parsed.repo;
      const topics = readStringArray(server.tags ?? server.topics);
      const sources = ["mcp-registry"];
      const kind = classifyKind({ name, description, topics, sources, hint: "mcp" });
      collected.push({
        repoFullName: parsed.fullName,
        htmlUrl: parsed.htmlUrl,
        name: name.slice(0, 160),
        description,
        stars: asNonNegativeInteger(server.stars),
        forks: 0,
        language: null,
        license: asString(server.license) || null,
        topics,
        kind,
        inferredPlatforms: inferPlatforms({ name, description, topics, sources }),
        score: 0,
        pushedAt: asString(server.updated_at) || asString(server.updatedAt) || null,
        sources,
      });
      if (collected.length >= limit) break;
    }
    const metadata = readRecord(root.metadata);
    const next = asString(metadata?.nextCursor) || asString(root.nextCursor) || asString(root.next_cursor);
    cursor = next || null;
    pages += 1;
    if (!cursor || servers.length === 0) break;
  }

  return collected.map((item) => ({
    ...item,
    score: computeScore({
      stars: item.stars,
      forks: item.forks,
      pushedAt: item.pushedAt,
      sources: item.sources,
      kind: item.kind,
      now,
    }),
  }));
}
