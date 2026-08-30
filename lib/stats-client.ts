import { publicEnvironment } from "./env";

export const STATS_REQUEST_TIMEOUT_MS = 8_000;
export const EVENT_REQUEST_TIMEOUT_MS = 5_000;
export const MAX_STATS_IDS_PER_REQUEST = 100;

const RESOURCE_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,78}[a-z0-9])$/;
const EVENT_ID_PATTERN = /^[A-Za-z0-9._~-]{16,128}$/;
const EVENT_TYPES = ["command_copy", "source_visit"] as const;

export type StatsEventType = (typeof EVENT_TYPES)[number];
export type ResourceStatsValue = Readonly<{
  commandCopies: number;
  sourceVisits: number;
  updatedAt: number;
}>;
export type ResourceStatsState =
  | Readonly<{ status: "loading" }>
  | Readonly<{ status: "available"; value: ResourceStatsValue }>
  | Readonly<{ status: "empty"; value: ResourceStatsValue }>
  | Readonly<{ status: "unavailable" }>;

type FetchImplementation = typeof fetch;
type StatsClientOptions = Readonly<{
  baseUrl?: string;
  fetchImplementation?: FetchImplementation;
  timeoutMs?: number;
}>;
type EventClientOptions = Readonly<{
  baseUrl?: string;
  fetchImplementation?: FetchImplementation;
  timeoutMs?: number;
  keepalive?: boolean;
  eventId?: string;
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

function assertResourceId(resourceId: string): void {
  if (!RESOURCE_ID_PATTERN.test(resourceId)) throw new Error("资源 ID 不符合统计协议。");
}

function normalizeResourceIds(resourceIds: ReadonlyArray<string>): string[] {
  const ids = [...new Set(resourceIds)].sort();
  ids.forEach(assertResourceId);
  if (ids.length > MAX_STATS_IDS_PER_REQUEST) throw new Error("单次统计请求最多包含 100 个资源 ID。");
  return ids;
}

function parseStatsValue(value: unknown): ResourceStatsValue {
  if (!isRecord(value) || !hasExactKeys(value, ["commandCopies", "sourceVisits", "updatedAt"])) {
    throw new Error("统计响应资源字段不符合协议。");
  }
  if (
    !isNonNegativeSafeInteger(value.commandCopies) ||
    !isNonNegativeSafeInteger(value.sourceVisits) ||
    !isNonNegativeSafeInteger(value.updatedAt)
  ) {
    throw new Error("统计响应计数不符合协议。");
  }
  return Object.freeze({
    commandCopies: value.commandCopies,
    sourceVisits: value.sourceVisits,
    updatedAt: value.updatedAt,
  });
}

function parseStatsResponse(payload: unknown, requestedIds: ReadonlyArray<string>): Readonly<Record<string, ResourceStatsValue>> {
  if (!isRecord(payload) || !hasExactKeys(payload, ["generatedAt", "resources"])) {
    throw new Error("统计响应不符合协议。");
  }
  if (!isNonNegativeSafeInteger(payload.generatedAt) || !isRecord(payload.resources)) {
    throw new Error("统计响应不符合协议。");
  }

  const requested = new Set(requestedIds);
  const parsed: Record<string, ResourceStatsValue> = {};
  for (const [resourceId, value] of Object.entries(payload.resources)) {
    if (!requested.has(resourceId) || !RESOURCE_ID_PATTERN.test(resourceId)) {
      throw new Error("统计响应包含未请求的资源。");
    }
    parsed[resourceId] = parseStatsValue(value);
  }
  return Object.freeze(parsed);
}

function parseEventResponse(payload: unknown, resourceId: string, eventType: StatsEventType): void {
  if (!isRecord(payload) || !hasExactKeys(payload, ["resourceId", "eventType", "counted", "stats"])) {
    throw new Error("事件响应不符合协议。");
  }
  if (payload.resourceId !== resourceId || payload.eventType !== eventType || typeof payload.counted !== "boolean") {
    throw new Error("事件响应不符合协议。");
  }
  parseStatsValue(payload.stats);
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
      reject(new Error("统计请求超时。"));
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

async function parseJsonResponse(response: Response): Promise<unknown> {
  if (!response.ok) throw new Error(`统计服务返回 HTTP ${response.status}。`);
  try {
    return await response.json() as unknown;
  } catch {
    throw new Error("统计服务未返回合法 JSON。");
  }
}

export class StatsClient {
  private readonly baseUrl: string;
  private readonly fetchImplementation: FetchImplementation;
  private readonly timeoutMs: number;
  private readonly inFlight = new Map<string, Promise<Readonly<Record<string, ResourceStatsState>>>>();

  constructor(options: StatsClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? publicEnvironment.statsApiUrl;
    this.fetchImplementation = options.fetchImplementation ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? STATS_REQUEST_TIMEOUT_MS;
  }

  load(resourceIds: ReadonlyArray<string>): Promise<Readonly<Record<string, ResourceStatsState>>> {
    const ids = normalizeResourceIds(resourceIds);
    if (ids.length === 0) return Promise.resolve(Object.freeze({}));
    const key = ids.join(",");
    const existing = this.inFlight.get(key);
    if (existing) return existing;

    const url = new URL("/v1/stats", this.baseUrl);
    url.searchParams.set("ids", key);
    const request = fetchWithTimeout(
      this.fetchImplementation,
      url.toString(),
      { method: "GET", cache: "no-store", headers: { Accept: "application/json" } },
      this.timeoutMs,
    )
      .then(parseJsonResponse)
      .then((payload) => parseStatsResponse(payload, ids))
      .then((resources) => Object.freeze(Object.fromEntries(ids.map((resourceId) => {
        const value = resources[resourceId];
        if (!value) return [resourceId, Object.freeze({ status: "unavailable" as const })];
        const status = value.commandCopies === 0 && value.sourceVisits === 0 ? "empty" : "available";
        return [resourceId, Object.freeze({ status, value })];
      }))));
    const tracked = request.finally(() => {
      if (this.inFlight.get(key) === tracked) this.inFlight.delete(key);
    });
    this.inFlight.set(key, tracked);
    return tracked;
  }
}

export function createEventId(): string {
  const bytes = new Uint8Array(24);
  globalThis.crypto.getRandomValues(bytes);
  const eventId = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  if (!EVENT_ID_PATTERN.test(eventId)) throw new Error("无法生成合法的统计事件 ID。");
  return eventId;
}

export async function recordStatsEvent(
  resourceId: string,
  eventType: StatsEventType,
  options: EventClientOptions = {},
): Promise<void> {
  assertResourceId(resourceId);
  if (!EVENT_TYPES.includes(eventType)) throw new Error("事件类型不符合统计协议。");
  const eventId = options.eventId ?? createEventId();
  if (!EVENT_ID_PATTERN.test(eventId)) throw new Error("事件 ID 不符合统计协议。");

  const response = await fetchWithTimeout(
    options.fetchImplementation ?? globalThis.fetch,
    new URL("/v1/events", options.baseUrl ?? publicEnvironment.statsApiUrl).toString(),
    {
      method: "POST",
      cache: "no-store",
      keepalive: options.keepalive ?? false,
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ resourceId, eventType, eventId }),
    },
    options.timeoutMs ?? EVENT_REQUEST_TIMEOUT_MS,
  );
  parseEventResponse(await parseJsonResponse(response), resourceId, eventType);
}
