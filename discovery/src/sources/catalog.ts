import { GITHUB_API, githubHeaders, normalizeSourceUrl, parseGithubRepo, readRecord } from "../github";
import type { FetchLike } from "./mcp-registry";

export type CatalogMatch = Readonly<{
  resourceId: string;
  repository: string;
  fullName: string | null;
}>;

function decodeBase64(content: string): string {
  const normalized = content.replace(/\n/g, "");
  const binary = atob(normalized);
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
}

export async function loadCatalogMatches(
  fetchImpl: FetchLike,
  token: string | undefined,
  catalogRepository: string,
): Promise<CatalogMatch[]> {
  const parsed = parseGithubRepo(`https://github.com/${catalogRepository}`);
  if (!parsed) return [];
  const treeResponse = await fetchImpl(`${GITHUB_API}/repos/${parsed.owner}/${parsed.repo}/git/trees/HEAD?recursive=1`, {
    headers: githubHeaders(token),
  });
  if (!treeResponse.ok) throw new Error(`GitHub catalog tree HTTP ${treeResponse.status}`);
  const treePayload = readRecord(await treeResponse.json());
  const tree = Array.isArray(treePayload?.tree) ? treePayload.tree : [];
  const resourceFiles = tree
    .map((entry) => readRecord(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
    .filter((entry) => entry.type === "blob" && typeof entry.path === "string")
    .map((entry) => entry.path as string)
    .filter((path) => /^resources\/[a-z0-9]+(?:-[a-z0-9]+)*\/resource\.json$/.test(path));

  const matches: CatalogMatch[] = [];
  for (const filePath of resourceFiles.slice(0, 400)) {
    const contentResponse = await fetchImpl(
      `${GITHUB_API}/repos/${parsed.owner}/${parsed.repo}/contents/${filePath}`,
      { headers: githubHeaders(token) },
    );
    if (!contentResponse.ok) continue;
    const payload = readRecord(await contentResponse.json());
    if (!payload || typeof payload.content !== "string") continue;
    let resource: Record<string, unknown> | null = null;
    try {
      resource = readRecord(JSON.parse(decodeBase64(payload.content)));
    } catch {
      continue;
    }
    if (!resource || typeof resource.id !== "string" || typeof resource.repository !== "string") continue;
    const normalized = normalizeSourceUrl(resource.repository);
    const repo = parseGithubRepo(resource.repository);
    matches.push({
      resourceId: resource.id,
      repository: normalized ?? resource.repository,
      fullName: repo?.fullName ?? null,
    });
  }
  return matches;
}
