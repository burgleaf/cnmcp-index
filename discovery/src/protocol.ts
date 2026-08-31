import type { DiscoveryKind } from "./classify";

export const DISCOVERY_KINDS = ["mcp", "skill", "plugin", "unknown"] as const;
export const DISCOVERY_SORTS = ["score", "stars", "recent"] as const;
export type DiscoverySort = (typeof DISCOVERY_SORTS)[number];

export type DiscoveryItem = Readonly<{
  repoFullName: string;
  htmlUrl: string;
  name: string;
  description: string;
  stars: number;
  kind: DiscoveryKind;
  inferredPlatforms: ReadonlyArray<string>;
  score: number;
  pushedAt: string | null;
  catalogId: string | null;
}>;

export type DiscoveryListQuery = Readonly<{
  kind: DiscoveryKind | null;
  sort: DiscoverySort;
  limit: number;
  offset: number;
}>;

export type DiscoveryListResponse = Readonly<{
  generatedAt: number;
  items: ReadonlyArray<DiscoveryItem>;
  nextCursor: string | null;
}>;

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 50;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseDiscoveryQuery(url: URL): DiscoveryListQuery {
  const kindRaw = url.searchParams.get("kind");
  const sortRaw = url.searchParams.get("sort") ?? "score";
  const limitRaw = url.searchParams.get("limit");
  const cursorRaw = url.searchParams.get("cursor");

  if (kindRaw && !DISCOVERY_KINDS.includes(kindRaw as DiscoveryKind)) {
    throw new Error("INVALID_KIND");
  }
  if (!DISCOVERY_SORTS.includes(sortRaw as DiscoverySort)) {
    throw new Error("INVALID_SORT");
  }

  let limit = DEFAULT_LIMIT;
  if (limitRaw !== null) {
    if (!/^\d+$/.test(limitRaw)) throw new Error("INVALID_LIMIT");
    limit = Number(limitRaw);
    if (limit < 1 || limit > MAX_LIMIT) throw new Error("INVALID_LIMIT");
  }

  let offset = 0;
  if (cursorRaw !== null) {
    if (!/^\d+$/.test(cursorRaw) || cursorRaw.length > 8) throw new Error("INVALID_CURSOR");
    offset = Number(cursorRaw);
    if (!Number.isSafeInteger(offset) || offset < 0) throw new Error("INVALID_CURSOR");
  }

  return {
    kind: kindRaw ? (kindRaw as DiscoveryKind) : null,
    sort: sortRaw as DiscoverySort,
    limit,
    offset,
  };
}

export function encodeNextCursor(offset: number, limit: number, totalReturned: number): string | null {
  if (totalReturned < limit) return null;
  return String(offset + limit);
}

export function publicDiscoveryItem(item: DiscoveryItem): DiscoveryItem {
  return {
    repoFullName: item.repoFullName,
    htmlUrl: item.htmlUrl,
    name: item.name,
    description: item.description,
    stars: item.stars,
    kind: item.kind,
    inferredPlatforms: item.inferredPlatforms,
    score: item.score,
    pushedAt: item.pushedAt,
    catalogId: item.catalogId,
  };
}

export function parseDiscoveryListResponse(payload: unknown): DiscoveryListResponse {
  if (!isRecord(payload) || typeof payload.generatedAt !== "number" || !Number.isSafeInteger(payload.generatedAt) || payload.generatedAt < 0) {
    throw new Error("发现响应不符合协议。");
  }
  if (!Array.isArray(payload.items)) throw new Error("发现响应不符合协议。");
  if (payload.nextCursor !== null && (typeof payload.nextCursor !== "string" || !/^\d+$/.test(payload.nextCursor))) {
    throw new Error("发现响应不符合协议。");
  }
  const items = payload.items.map((item) => parseDiscoveryItem(item));
  return {
    generatedAt: payload.generatedAt,
    items,
    nextCursor: payload.nextCursor,
  };
}

function parseDiscoveryItem(value: unknown): DiscoveryItem {
  if (!isRecord(value)) throw new Error("发现响应不符合协议。");
  const required = [
    "repoFullName",
    "htmlUrl",
    "name",
    "description",
    "stars",
    "kind",
    "inferredPlatforms",
    "score",
    "pushedAt",
    "catalogId",
  ];
  if (Object.keys(value).length !== required.length || required.some((key) => !(key in value))) {
    throw new Error("发现响应不符合协议。");
  }
  if (
    typeof value.repoFullName !== "string" ||
    typeof value.htmlUrl !== "string" ||
    typeof value.name !== "string" ||
    typeof value.description !== "string" ||
    typeof value.stars !== "number" ||
    !Number.isSafeInteger(value.stars) ||
    value.stars < 0 ||
    typeof value.kind !== "string" ||
    !DISCOVERY_KINDS.includes(value.kind as DiscoveryKind) ||
    !Array.isArray(value.inferredPlatforms) ||
    value.inferredPlatforms.some((platform) => typeof platform !== "string") ||
    typeof value.score !== "number" ||
    !Number.isFinite(value.score) ||
    (value.pushedAt !== null && typeof value.pushedAt !== "string") ||
    (value.catalogId !== null && typeof value.catalogId !== "string")
  ) {
    throw new Error("发现响应不符合协议。");
  }
  if (!/^https:\/\/github\.com\/[^/]+\/[^/]+$/.test(value.htmlUrl)) {
    throw new Error("发现响应不符合协议。");
  }
  return {
    repoFullName: value.repoFullName,
    htmlUrl: value.htmlUrl,
    name: value.name,
    description: value.description,
    stars: value.stars,
    kind: value.kind as DiscoveryKind,
    inferredPlatforms: value.inferredPlatforms as string[],
    score: value.score,
    pushedAt: value.pushedAt,
    catalogId: value.catalogId,
  };
}
