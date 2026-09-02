import type { ResourceKind } from "./catalog-types";
import { publicEnvironment } from "./env";
import { createEventId } from "./stats-client";

export const SEARCH_GAP_REQUEST_TIMEOUT_MS = 5_000;

const EVENT_ID_PATTERN = /^[A-Za-z0-9._~-]{16,128}$/;
const GAP_ID_PATTERN = /^gap-[a-f0-9]{24}$/;
const TAG_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SECRET_PATTERNS = [
  /(?:sk|gh[pousr]|github_pat)[-_][A-Za-z0-9_-]{16,}/i,
  /\bbearer\s+[A-Za-z0-9._~+/-]{16,}/i,
];
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const URL_PATTERN = /https?:\/\/[^\s]+/gi;
const SEARCH_BUCKETS = ["zero", "low", "healthy"] as const;

type SearchBucket = (typeof SEARCH_BUCKETS)[number];
type FetchImplementation = typeof fetch;

export type SearchGapEvent = Readonly<{
  query: string;
  resultCount: number;
  kind?: ResourceKind | "";
  tag?: string;
}>;

type SearchGapClientOptions = Readonly<{
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

export function sanitizeTaskQuery(value: string): string | null {
  const normalized = value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
  if (SECRET_PATTERNS.some((pattern) => pattern.test(normalized))) return null;
  const redacted = normalized
    .replace(EMAIL_PATTERN, "[email]")
    .replace(URL_PATTERN, "[url]")
    .replace(/\s+/g, " ")
    .trim();
  const truncated = Array.from(redacted).slice(0, 80).join("").trim();
  return Array.from(truncated).length >= 2 ? truncated : null;
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
      reject(new Error("搜索缺口请求超时。"));
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

async function parseResponse(response: Response): Promise<Record<string, unknown>> {
  if (!response.ok) throw new Error(`统计服务返回 HTTP ${response.status}。`);
  let payload: unknown;
  try {
    payload = await response.json() as unknown;
  } catch {
    throw new Error("统计服务未返回合法 JSON。");
  }
  if (!isRecord(payload) || !hasExactKeys(payload, ["gapId", "counted", "bucket"])) {
    throw new Error("搜索缺口响应不符合协议。");
  }
  if (
    typeof payload.gapId !== "string" ||
    !GAP_ID_PATTERN.test(payload.gapId) ||
    typeof payload.counted !== "boolean" ||
    typeof payload.bucket !== "string" ||
    !SEARCH_BUCKETS.includes(payload.bucket as SearchBucket)
  ) {
    throw new Error("搜索缺口响应不符合协议。");
  }
  return payload;
}

export async function recordSearchGapEvent(
  event: SearchGapEvent,
  options: SearchGapClientOptions = {},
): Promise<boolean> {
  const query = sanitizeTaskQuery(event.query);
  if (!query) return false;
  if (!Number.isSafeInteger(event.resultCount) || event.resultCount < 0 || event.resultCount > 10_000) {
    throw new Error("搜索结果数量不符合统计协议。");
  }
  if (event.kind && !["mcp", "skill", "plugin"].includes(event.kind)) {
    throw new Error("资源类型不符合统计协议。");
  }
  if (event.tag && (!TAG_ID_PATTERN.test(event.tag) || event.tag.length > 64)) {
    throw new Error("标签不符合统计协议。");
  }
  const eventId = options.eventId ?? createEventId();
  if (!EVENT_ID_PATTERN.test(eventId)) throw new Error("事件 ID 不符合统计协议。");

  const body = {
    query,
    resultCount: event.resultCount,
    ...(event.kind ? { kind: event.kind } : {}),
    ...(event.tag ? { tag: event.tag } : {}),
    eventId,
  };
  const response = await fetchWithTimeout(
    options.fetchImplementation ?? globalThis.fetch,
    new URL("/v1/search-events", options.baseUrl ?? publicEnvironment.statsApiUrl).toString(),
    {
      method: "POST",
      cache: "no-store",
      keepalive: options.keepalive ?? false,
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    options.timeoutMs ?? SEARCH_GAP_REQUEST_TIMEOUT_MS,
  );
  const payload = await parseResponse(response);
  return payload.counted as boolean;
}
