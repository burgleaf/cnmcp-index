import { startDailyCrawl } from "./crawl";
import { listDiscoveryItems } from "./db";
import { encodeNextCursor, parseDiscoveryQuery } from "./protocol";
import { DiscoveryCrawlWorkflow } from "./workflow";

const JSON_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  Vary: "Origin",
} as const;

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

function validateOptionalOrigin(request: Request, env: WorkerEnv): string | null {
  const origin = request.headers.get("Origin");
  if (origin && !allowedOrigins(env).has(origin)) {
    throw new ApiError(403, "ORIGIN_FORBIDDEN", "Origin is not allowed");
  }
  return origin;
}

function requireAllowedOrigin(request: Request, env: WorkerEnv): string {
  const origin = request.headers.get("Origin");
  if (!origin || !allowedOrigins(env).has(origin)) {
    throw new ApiError(403, "ORIGIN_FORBIDDEN", "Origin is not allowed");
  }
  return origin;
}

function logRequest(path: string, status: number, errorCode: string, startedAt: number): void {
  const entry = JSON.stringify({ path, status, errorCode, durationMs: Math.max(0, Date.now() - startedAt) });
  if (status >= 500) console.error(entry);
  else console.info(entry);
}

function preflight(request: Request, env: WorkerEnv): RequestResult {
  const url = new URL(request.url);
  if (url.pathname !== "/v1/discovery") {
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
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "600",
        Vary: "Origin",
      },
    }),
  };
}

async function readDiscovery(request: Request, env: WorkerEnv, now: number): Promise<RequestResult> {
  const origin = validateOptionalOrigin(request, env);
  let query;
  try {
    query = parseDiscoveryQuery(new URL(request.url));
  } catch (error) {
    const code = error instanceof Error ? error.message : "INVALID_REQUEST";
    const messages: Record<string, string> = {
      INVALID_KIND: "Kind is invalid",
      INVALID_SORT: "Sort is invalid",
      INVALID_LIMIT: "Limit is invalid",
      INVALID_CURSOR: "Cursor is invalid",
    };
    throw new ApiError(400, code, messages[code] ?? "Request fields are invalid");
  }
  const items = await listDiscoveryItems(env.DB, query);
  return {
    errorCode: "OK",
    response: jsonResponse(
      {
        generatedAt: now,
        items,
        nextCursor: encodeNextCursor(query.offset, query.limit, items.length),
      },
      200,
      origin,
      env,
    ),
  };
}

async function dispatch(request: Request, env: WorkerEnv, now: number): Promise<RequestResult> {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") return preflight(request, env);
  if (request.method === "GET" && url.pathname === "/v1/discovery") return await readDiscovery(request, env, now);
  throw new ApiError(404, "NOT_FOUND", "Route was not found");
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
        : request.method === "GET" && path === "/v1/discovery"
          ? new ApiError(503, "SERVICE_UNAVAILABLE", "Discovery is temporarily unavailable")
          : new ApiError(500, "INTERNAL_ERROR", "An internal error occurred");
    logRequest(path, apiError.status, apiError.code, startedAt);
    return errorResponse(apiError, origin, env);
  }
}

export { DiscoveryCrawlWorkflow };

export default {
  fetch(request: Request, env: WorkerEnv): Promise<Response> {
    return handleRequest(request, env);
  },
  async scheduled(_controller: ScheduledController, env: WorkerEnv): Promise<void> {
    const startedAt = Date.now();
    try {
      const result = await startDailyCrawl(env);
      logRequest("scheduled", 200, result === "already" ? "ALREADY_RUNNING" : "OK", startedAt);
    } catch {
      logRequest("scheduled", 500, "INTERNAL_ERROR", startedAt);
      throw new Error("scheduled discovery crawl failed");
    }
  },
} satisfies ExportedHandler<WorkerEnv>;
