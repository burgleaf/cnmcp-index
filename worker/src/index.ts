import {
  computeGapPriorityScore,
  refreshTaskGaps,
  resultBucket,
  sanitizeTaskQuery,
} from "./task-gaps";

const JSON_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  Vary: "Origin",
} as const;

const MAX_BODY_BYTES = 16_384;
const RESOURCE_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,78}[a-z0-9])$/;
const EVENT_ID_PATTERN = /^[A-Za-z0-9._~-]{16,128}$/;
const EVENT_TYPES = ["command_copy", "source_visit"] as const;
const RESOURCE_KINDS = ["mcp", "skill", "plugin"] as const;
const TAG_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type EventType = (typeof EVENT_TYPES)[number];
type ResourceKind = (typeof RESOURCE_KINDS)[number];
type StatsRow = {
  resource_id: string;
  command_copies: number;
  source_visits: number;
  updated_at: number;
};
type EventInput = { resourceId: string; eventType: EventType; eventId: string };
type SearchEventInput = {
  query: string;
  resultCount: number;
  eventId: string;
  kind: ResourceKind | null;
  tag: string | null;
};
type RequestResult = { response: Response; errorCode: string };

class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly publicMessage: string,
  ) {
    super(code);
  }
}

function allowedOrigins(env: WorkerEnv): Set<string> {
  return new Set(
    env.ALLOWED_ORIGINS.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
}

function corsHeaders(origin: string | null, env: WorkerEnv): Record<string, string> {
  return origin && allowedOrigins(env).has(origin) ? { "Access-Control-Allow-Origin": origin } : {};
}

function jsonResponse(payload: unknown, status: number, origin: string | null, env: WorkerEnv): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...JSON_HEADERS, ...corsHeaders(origin, env) },
  });
}

function errorResponse(error: ApiError, origin: string | null, env: WorkerEnv): Response {
  return jsonResponse({ error: { code: error.code, message: error.publicMessage } }, error.status, origin, env);
}

function requireAllowedOrigin(request: Request, env: WorkerEnv): string {
  const origin = request.headers.get("Origin");
  if (!origin || !allowedOrigins(env).has(origin)) {
    throw new ApiError(403, "ORIGIN_FORBIDDEN", "Origin is not allowed");
  }
  return origin;
}

function validateOptionalOrigin(request: Request, env: WorkerEnv): string | null {
  const origin = request.headers.get("Origin");
  if (origin && !allowedOrigins(env).has(origin)) {
    throw new ApiError(403, "ORIGIN_FORBIDDEN", "Origin is not allowed");
  }
  return origin;
}

function parseIntegerSetting(value: string, name: string, minimum: number, maximum: number): number {
  if (!/^\d+$/.test(value)) throw new ApiError(500, "CONFIGURATION_ERROR", "Service configuration is invalid");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new ApiError(500, "CONFIGURATION_ERROR", "Service configuration is invalid");
  }
  void name;
  return parsed;
}

export function decodeHashSalt(value: string | undefined): Uint8Array {
  if (!value?.startsWith("base64url:")) {
    throw new ApiError(500, "CONFIGURATION_ERROR", "Service configuration is invalid");
  }
  const encoded = value.slice("base64url:".length);
  if (!/^[A-Za-z0-9_-]+$/.test(encoded)) {
    throw new ApiError(500, "CONFIGURATION_ERROR", "Service configuration is invalid");
  }
  const padded = encoded.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(encoded.length / 4) * 4, "=");
  let decoded: string;
  try {
    decoded = atob(padded);
  } catch {
    throw new ApiError(500, "CONFIGURATION_ERROR", "Service configuration is invalid");
  }
  const bytes = Uint8Array.from(decoded, (character) => character.charCodeAt(0));
  if (bytes.byteLength < 32) {
    throw new ApiError(500, "CONFIGURATION_ERROR", "Service configuration is invalid");
  }
  return bytes;
}

async function hmacHex(keyBytes: Uint8Array, value: string): Promise<string> {
  const keyMaterial = Uint8Array.from(keyBytes).buffer;
  const key = await crypto.subtle.importKey("raw", keyMaterial, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function readJsonBody(request: Request): Promise<unknown> {
  const declaredLength = request.headers.get("Content-Length");
  if (declaredLength && /^\d+$/.test(declaredLength) && Number(declaredLength) > MAX_BODY_BYTES) {
    throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Request body is too large");
  }
  if (!request.body) throw new ApiError(400, "INVALID_JSON", "Request body must be valid JSON");

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let byteLength = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Request body is too large");
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiError(400, "INVALID_JSON", "Request body must be valid JSON");
  }
}

function parseEventInput(input: unknown): EventInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ApiError(400, "INVALID_REQUEST", "Request fields are invalid");
  }
  const record = input as Record<string, unknown>;
  if (
    Object.keys(record).some((key) => !["resourceId", "eventType", "eventId"].includes(key)) ||
    typeof record.resourceId !== "string" ||
    !RESOURCE_ID_PATTERN.test(record.resourceId) ||
    typeof record.eventType !== "string" ||
    !EVENT_TYPES.includes(record.eventType as EventType) ||
    typeof record.eventId !== "string" ||
    !EVENT_ID_PATTERN.test(record.eventId)
  ) {
    throw new ApiError(400, "INVALID_REQUEST", "Request fields are invalid");
  }
  return record as EventInput;
}

function parseSearchEventInput(input: unknown): SearchEventInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ApiError(400, "INVALID_REQUEST", "Request fields are invalid");
  }
  const record = input as Record<string, unknown>;
  const query = typeof record.query === "string" ? sanitizeTaskQuery(record.query) : null;
  if (
    Object.keys(record).some((key) => !["query", "resultCount", "eventId", "kind", "tag"].includes(key)) ||
    !query ||
    typeof record.resultCount !== "number" ||
    !Number.isSafeInteger(record.resultCount) ||
    record.resultCount < 0 ||
    record.resultCount > 10_000 ||
    typeof record.eventId !== "string" ||
    !EVENT_ID_PATTERN.test(record.eventId) ||
    (record.kind !== undefined &&
      (typeof record.kind !== "string" || !RESOURCE_KINDS.includes(record.kind as ResourceKind))) ||
    (record.tag !== undefined &&
      (typeof record.tag !== "string" || record.tag.length > 64 || !TAG_ID_PATTERN.test(record.tag)))
  ) {
    throw new ApiError(400, "INVALID_REQUEST", "Request fields are invalid");
  }
  return {
    query,
    resultCount: record.resultCount,
    eventId: record.eventId,
    kind: (record.kind as ResourceKind | undefined) ?? null,
    tag: (record.tag as string | undefined) ?? null,
  };
}

function statsPayload(row: StatsRow) {
  return {
    commandCopies: row.command_copies,
    sourceVisits: row.source_visits,
    updatedAt: row.updated_at,
  };
}

async function consumeRateLimit(request: Request, env: WorkerEnv, now: number, salt: Uint8Array): Promise<void> {
  const limit = parseIntegerSetting(env.EVENT_RATE_LIMIT_PER_HOUR, "EVENT_RATE_LIMIT_PER_HOUR", 1, 100_000);
  const rateRetention = parseIntegerSetting(env.RATE_LIMIT_RETENTION_SECONDS, "RATE_LIMIT_RETENTION_SECONDS", 60, 86_400);
  const bucketStart = Math.floor(now / 3_600_000) * 3_600_000;
  const clientAddress = request.headers.get("CF-Connecting-IP") ?? "unavailable";
  const rateKey = await hmacHex(salt, `rate|${clientAddress}|${bucketStart}`);
  const rate = await env.DB.prepare(
    `INSERT INTO metric_rate_limits (rate_key, bucket_start, event_count, expires_at)
     VALUES (?1, ?2, 1, ?3)
     ON CONFLICT(rate_key) DO UPDATE SET
       event_count = metric_rate_limits.event_count + 1,
       expires_at = excluded.expires_at
     RETURNING event_count`,
  )
    .bind(rateKey, bucketStart, now + rateRetention * 1000)
    .first<{ event_count: number }>();
  if (!rate) throw new Error("rate limit update returned no row");
  if (rate.event_count > limit) throw new ApiError(429, "RATE_LIMITED", "Too many events");
}

async function recordEvent(request: Request, env: WorkerEnv, now: number): Promise<RequestResult> {
  const origin = requireAllowedOrigin(request, env);
  const input = parseEventInput(await readJsonBody(request));
  const catalog = await env.DB.prepare("SELECT active FROM resource_catalog WHERE resource_id = ?1")
    .bind(input.resourceId)
    .first<{ active: number }>();
  if (!catalog || catalog.active !== 1) throw new ApiError(404, "RESOURCE_NOT_FOUND", "Resource was not found");

  const salt = decodeHashSalt(env.HASH_SALT);
  const receiptRetention = parseIntegerSetting(env.RECEIPT_RETENTION_SECONDS, "RECEIPT_RETENTION_SECONDS", 60, 31_536_000);
  const eventKey = await hmacHex(salt, `event|${input.resourceId}|${input.eventType}|${input.eventId}`);
  await consumeRateLimit(request, env, now, salt);

  const receipt = await env.DB.prepare(
    `INSERT OR IGNORE INTO metric_receipts (event_key, resource_id, event_type, created_at, expires_at)
     VALUES (?1, ?2, ?3, ?4, ?5)
     RETURNING event_key`,
  )
    .bind(eventKey, input.resourceId, input.eventType, now, now + receiptRetention * 1000)
    .first<{ event_key: string }>();
  const stats = await env.DB.prepare(
    `SELECT resource_id, command_copies, source_visits, updated_at
     FROM resource_stats WHERE resource_id = ?1`,
  )
    .bind(input.resourceId)
    .first<StatsRow>();
  if (!stats) throw new Error("statistics row missing");

  return {
    errorCode: "OK",
    response: jsonResponse(
      {
        resourceId: input.resourceId,
        eventType: input.eventType,
        counted: Boolean(receipt),
        stats: statsPayload(stats),
      },
      200,
      origin,
      env,
    ),
  };
}

async function recordSearchEvent(request: Request, env: WorkerEnv, now: number): Promise<RequestResult> {
  const origin = requireAllowedOrigin(request, env);
  const input = parseSearchEventInput(await readJsonBody(request));
  const salt = decodeHashSalt(env.HASH_SALT);
  const retention = parseIntegerSetting(
    env.TASK_QUERY_RETENTION_SECONDS,
    "TASK_QUERY_RETENTION_SECONDS",
    86_400,
    31_536_000,
  );
  const identity = JSON.stringify([input.query, input.kind ?? "", input.tag ?? ""]);
  const digest = await hmacHex(salt, `gap|${identity}`);
  const gapId = `gap-${digest.slice(0, 24)}`;
  const eventKey = await hmacHex(salt, `search-event|${gapId}|${input.eventId}`);
  await consumeRateLimit(request, env, now, salt);

  const receipt = await env.DB.prepare(
    `INSERT OR IGNORE INTO search_event_receipts (
       event_key, gap_id, normalized_query, resource_kind, tag_id, result_count, created_at, expires_at
     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
     RETURNING event_key`,
  ).bind(
    eventKey,
    gapId,
    input.query,
    input.kind,
    input.tag,
    input.resultCount,
    now,
    now + retention * 1000,
  ).first<{ event_key: string }>();

  return {
    errorCode: "OK",
    response: jsonResponse(
      { gapId, counted: Boolean(receipt), bucket: resultBucket(input.resultCount) },
      200,
      origin,
      env,
    ),
  };
}

function parseRequestedIds(url: URL): string[] | null {
  if (!url.searchParams.has("ids")) return null;
  const raw = url.searchParams.get("ids") ?? "";
  if (!raw) throw new ApiError(400, "INVALID_IDS", "Resource IDs are invalid");
  const ids = [...new Set(raw.split(","))];
  if (ids.length > 100 || ids.some((id) => !RESOURCE_ID_PATTERN.test(id))) {
    throw new ApiError(400, "INVALID_IDS", "Resource IDs are invalid");
  }
  return ids;
}

async function readStats(request: Request, env: WorkerEnv, now: number): Promise<RequestResult> {
  const origin = validateOptionalOrigin(request, env);
  const ids = parseRequestedIds(new URL(request.url));
  const statement = ids
    ? env.DB.prepare(
        `SELECT s.resource_id, s.command_copies, s.source_visits, s.updated_at
         FROM resource_stats s
         INNER JOIN resource_catalog c ON c.resource_id = s.resource_id AND c.active = 1
         INNER JOIN json_each(?1) requested ON requested.value = s.resource_id
         ORDER BY s.resource_id`,
      ).bind(JSON.stringify(ids))
    : env.DB.prepare(
        `SELECT s.resource_id, s.command_copies, s.source_visits, s.updated_at
         FROM resource_stats s
         INNER JOIN resource_catalog c ON c.resource_id = s.resource_id AND c.active = 1
         ORDER BY s.resource_id`,
      );
  const result = await statement.all<StatsRow>();
  const resources = Object.fromEntries(result.results.map((row) => [row.resource_id, statsPayload(row)]));
  return {
    errorCode: "OK",
    response: jsonResponse({ generatedAt: now, resources }, 200, origin, env),
  };
}

function preflight(request: Request, env: WorkerEnv): RequestResult {
  const url = new URL(request.url);
  if (!["/v1/events", "/v1/search-events", "/v1/stats"].includes(url.pathname)) {
    throw new ApiError(404, "NOT_FOUND", "Route was not found");
  }
  const origin = requireAllowedOrigin(request, env);
  return {
    errorCode: "OK",
    response: new Response(null, {
      status: 204,
      headers: {
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "600",
        Vary: "Origin",
      },
    }),
  };
}

async function dispatch(request: Request, env: WorkerEnv, now: number): Promise<RequestResult> {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") return preflight(request, env);
  if (request.method === "POST" && url.pathname === "/v1/events") return await recordEvent(request, env, now);
  if (request.method === "POST" && url.pathname === "/v1/search-events") return await recordSearchEvent(request, env, now);
  if (request.method === "GET" && url.pathname === "/v1/stats") return await readStats(request, env, now);
  throw new ApiError(404, "NOT_FOUND", "Route was not found");
}

function logRequest(path: string, status: number, errorCode: string, startedAt: number): void {
  const entry = JSON.stringify({ path, status, errorCode, durationMs: Math.max(0, Date.now() - startedAt) });
  if (status >= 500) console.error(entry);
  else console.info(entry);
}

export async function handleRequest(request: Request, env: WorkerEnv, now = Date.now()): Promise<Response> {
  const startedAt = Date.now();
  const path = new URL(request.url).pathname;
  const origin = request.headers.get("Origin");
  try {
    const result = await dispatch(request, env, now);
    logRequest(path, result.response.status, result.errorCode, startedAt);
    return result.response;
  } catch (error) {
    const apiError =
      error instanceof ApiError
        ? error
        : request.method === "GET" && path === "/v1/stats"
          ? new ApiError(503, "SERVICE_UNAVAILABLE", "Statistics are temporarily unavailable")
          : new ApiError(500, "INTERNAL_ERROR", "An internal error occurred");
    logRequest(path, apiError.status, apiError.code, startedAt);
    return errorResponse(apiError, origin, env);
  }
}

export async function cleanupExpired(env: WorkerEnv, now = Date.now()): Promise<void> {
  const retention = parseIntegerSetting(
    env.TASK_QUERY_RETENTION_SECONDS,
    "TASK_QUERY_RETENTION_SECONDS",
    86_400,
    31_536_000,
  );
  const staleBefore = now - retention * 1000;
  await env.DB.batch([
    env.DB.prepare("DELETE FROM metric_receipts WHERE expires_at <= ?1").bind(now),
    env.DB.prepare("DELETE FROM search_event_receipts WHERE expires_at <= ?1").bind(now),
    env.DB.prepare("DELETE FROM metric_rate_limits WHERE expires_at <= ?1").bind(now),
    env.DB.prepare(
      `DELETE FROM task_gap_ledger
       WHERE gap_id IN (SELECT gap_id FROM task_gaps WHERE status = 'observed' AND last_seen <= ?1)`,
    ).bind(staleBefore),
    env.DB.prepare("DELETE FROM task_gaps WHERE status = 'observed' AND last_seen <= ?1").bind(staleBefore),
  ]);
}

export default {
  fetch(request: Request, env: WorkerEnv): Promise<Response> {
    return handleRequest(request, env);
  },
  async scheduled(_controller: ScheduledController, env: WorkerEnv): Promise<void> {
    const startedAt = Date.now();
    try {
      await cleanupExpired(env);
      await refreshTaskGaps(env);
      logRequest("scheduled", 200, "OK", startedAt);
    } catch {
      logRequest("scheduled", 500, "INTERNAL_ERROR", startedAt);
      throw new Error("scheduled cleanup failed");
    }
  },
} satisfies ExportedHandler<WorkerEnv>;

export { computeGapPriorityScore, refreshTaskGaps };
