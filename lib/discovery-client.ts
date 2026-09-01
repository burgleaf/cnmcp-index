import { publicEnvironment } from "./env";

export const DISCOVERY_REQUEST_TIMEOUT_MS = 8_000;
export const DISCOVERY_KINDS = ["mcp", "skill", "plugin"] as const;
export const DISCOVERY_SORTS = ["score", "stars", "recent"] as const;

export type DiscoveryKind = (typeof DISCOVERY_KINDS)[number];
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

export type DiscoveryList = Readonly<{
  generatedAt: number;
  items: ReadonlyArray<DiscoveryItem>;
  nextCursor: string | null;
}>;

export type DiscoveryQuery = Readonly<{
  kind?: DiscoveryKind | "";
  sort?: DiscoverySort;
  limit?: number;
  cursor?: string | null;
}>;

type FetchImplementation = typeof fetch;
type DiscoveryClientOptions = Readonly<{
  baseUrl?: string;
  fetchImplementation?: FetchImplementation;
  timeoutMs?: number;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(record: Record<string, unknown>, keys: ReadonlyArray<string>): boolean {
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function parseDiscoveryItem(value: unknown): DiscoveryItem {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
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
    ])
  ) {
    throw new Error("发现响应不符合协议。");
  }
  if (
    typeof value.repoFullName !== "string" ||
    typeof value.htmlUrl !== "string" ||
    !/^https:\/\/github\.com\/[^/]+\/[^/]+$/.test(value.htmlUrl) ||
    typeof value.name !== "string" ||
    typeof value.description !== "string" ||
    !isNonNegativeSafeInteger(value.stars) ||
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
  return Object.freeze({
    repoFullName: value.repoFullName,
    htmlUrl: value.htmlUrl,
    name: value.name,
    description: value.description,
    stars: value.stars,
    kind: value.kind as DiscoveryKind,
    inferredPlatforms: Object.freeze([...value.inferredPlatforms]),
    score: value.score,
    pushedAt: value.pushedAt,
    catalogId: value.catalogId,
  });
}

function parseDiscoveryList(payload: unknown): DiscoveryList {
  if (!isRecord(payload) || !hasExactKeys(payload, ["generatedAt", "items", "nextCursor"])) {
    throw new Error("发现响应不符合协议。");
  }
  if (!isNonNegativeSafeInteger(payload.generatedAt) || !Array.isArray(payload.items)) {
    throw new Error("发现响应不符合协议。");
  }
  if (payload.nextCursor !== null && (typeof payload.nextCursor !== "string" || !/^\d+$/.test(payload.nextCursor))) {
    throw new Error("发现响应不符合协议。");
  }
  return Object.freeze({
    generatedAt: payload.generatedAt,
    items: Object.freeze(payload.items.map(parseDiscoveryItem)),
    nextCursor: payload.nextCursor,
  });
}

async function fetchWithTimeout(
  fetchImplementation: FetchImplementation,
  input: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error("发现请求超时。"));
      controller.abort();
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      fetchImplementation(input, { ...init, signal: controller.signal }),
      timeout,
    ]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

export class DiscoveryClient {
  private readonly baseUrl: string;
  private readonly fetchImplementation: FetchImplementation;
  private readonly timeoutMs: number;

  constructor(options: DiscoveryClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? publicEnvironment.discoveryApiUrl;
    this.fetchImplementation = options.fetchImplementation ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? DISCOVERY_REQUEST_TIMEOUT_MS;
  }

  async list(query: DiscoveryQuery = {}): Promise<DiscoveryList> {
    const url = new URL("/v1/discovery", this.baseUrl);
    if (query.kind) url.searchParams.set("kind", query.kind);
    if (query.sort) url.searchParams.set("sort", query.sort);
    if (typeof query.limit === "number") url.searchParams.set("limit", String(query.limit));
    if (query.cursor) url.searchParams.set("cursor", query.cursor);
    const response = await fetchWithTimeout(
      this.fetchImplementation,
      url.toString(),
      { method: "GET", cache: "no-store", headers: { Accept: "application/json" } },
      this.timeoutMs,
    );
    if (!response.ok) throw new Error(`发现服务返回 HTTP ${response.status}。`);
    try {
      return parseDiscoveryList((await response.json()) as unknown);
    } catch (error) {
      if (error instanceof Error && error.message === "发现响应不符合协议。") throw error;
      throw new Error("发现服务未返回合法 JSON。");
    }
  }
}

export function loadDiscoveryList(query: DiscoveryQuery = {}, options: DiscoveryClientOptions = {}): Promise<DiscoveryList> {
  return new DiscoveryClient(options).list(query);
}
