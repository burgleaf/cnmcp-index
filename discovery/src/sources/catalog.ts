import { parseGithubRepo, readRecord } from "../github";
import type { FetchLike } from "./mcp-registry";

export type CatalogMatch = Readonly<{
  resourceId: string;
  repository: string;
  fullName: string | null;
}>;

function asTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function loadCatalogMatches(fetchImpl: FetchLike, catalogJsonUrl: string): Promise<CatalogMatch[]> {
  const response = await fetchImpl(catalogJsonUrl, {
    headers: { Accept: "application/json", "User-Agent": "cnmcp-discovery/0.1" },
  });
  if (!response.ok) throw new Error(`Catalog JSON HTTP ${response.status}`);
  const root = readRecord(await response.json());
  if (!root || root.schemaVersion !== 1 || !Array.isArray(root.resources)) {
    throw new Error("Catalog JSON 不符合协议");
  }

  const matches: CatalogMatch[] = [];
  for (const raw of root.resources) {
    const resource = readRecord(raw);
    const resourceId = asTrimmedString(resource?.id);
    const repository = asTrimmedString(resource?.repository);
    if (!resourceId || !repository) continue;
    const repo = parseGithubRepo(repository);
    matches.push({
      resourceId,
      repository,
      fullName: repo?.fullName ?? null,
    });
  }
  if (root.resources.length > 0 && matches.length === 0) {
    throw new Error("Catalog JSON 缺少 repository");
  }
  return matches;
}
