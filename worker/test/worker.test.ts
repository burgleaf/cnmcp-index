import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCatalogSyncSql } from "../../scripts/lib/stats-catalog-sync.mjs";
import { cleanupExpired, decodeHashSalt, handleRequest } from "../src/index";

const ORIGIN = "https://www.cnmcp.com";
const NOW = 1_800_000_000_000;
const VALID_SALT = `base64url:${"a".repeat(43)}`;

function testEnv(overrides: Partial<WorkerEnv> = {}): WorkerEnv {
  return { ...env, ...overrides };
}

function eventRequest(
  resourceId = "active-resource",
  eventType = "command_copy",
  eventId = "event-identifier-0001",
  headers: Record<string, string> = {},
): Request {
  return new Request("https://api.cnmcp.com/v1/events", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: ORIGIN,
      "CF-Connecting-IP": "203.0.113.8",
      ...headers,
    },
    body: JSON.stringify({ resourceId, eventType, eventId }),
  });
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return response.json<Record<string, unknown>>();
}

async function clearDatabase(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM metric_receipts"),
    env.DB.prepare("DELETE FROM metric_rate_limits"),
    env.DB.prepare("DELETE FROM resource_stats"),
    env.DB.prepare("DELETE FROM resource_catalog"),
  ]);
}

async function seedCatalog(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare("INSERT INTO resource_catalog (resource_id, active, synced_at) VALUES (?1, 1, ?2)").bind(
      "active-resource",
      NOW,
    ),
    env.DB.prepare("INSERT INTO resource_catalog (resource_id, active, synced_at) VALUES (?1, 0, ?2)").bind(
      "stopped-resource",
      NOW,
    ),
    env.DB.prepare("INSERT INTO resource_stats (resource_id) VALUES (?1)").bind("active-resource"),
    env.DB.prepare("INSERT INTO resource_stats (resource_id) VALUES (?1)").bind("stopped-resource"),
  ]);
}

beforeEach(async () => {
  vi.restoreAllMocks();
  await clearDatabase();
  await seedCatalog();
});

describe("CORS 与统一错误协议", () => {
  it("允许配置 Origin 的预检并对所有响应禁用缓存", async () => {
    const response = await handleRequest(
      new Request("https://api.cnmcp.com/v1/events", { method: "OPTIONS", headers: { Origin: ORIGIN } }),
      env,
      NOW,
    );
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it.each([
    ["缺少 Origin", {}],
    ["Origin 非法", { Origin: "https://attacker.example" }],
  ])("POST 拒绝%s", async (_name, headers) => {
    const request = eventRequest();
    for (const [key, value] of Object.entries(headers)) request.headers.set(key, value);
    if (!("Origin" in headers)) request.headers.delete("Origin");
    const response = await handleRequest(request, env, NOW);
    expect(response.status).toBe(403);
    expect(await json(response)).toEqual({ error: { code: "ORIGIN_FORBIDDEN", message: "Origin is not allowed" } });
  });

  it("GET 拒绝非法 Origin，但允许无 Origin 的服务端读取", async () => {
    const forbidden = await handleRequest(
      new Request("https://api.cnmcp.com/v1/stats", { headers: { Origin: "https://attacker.example" } }),
      env,
      NOW,
    );
    const direct = await handleRequest(new Request("https://api.cnmcp.com/v1/stats"), env, NOW);
    expect(forbidden.status).toBe(403);
    expect(direct.status).toBe(200);
  });
});

describe("POST /v1/events 输入、隐私与统计", () => {
  it.each([
    ["非法 JSON", "{", 400, "INVALID_JSON"],
    ["超大 body", " ".repeat(16_385), 413, "PAYLOAD_TOO_LARGE"],
    ["数组 body", "[]", 400, "INVALID_REQUEST"],
  ])("拒绝%s", async (_name, body, status, code) => {
    const response = await handleRequest(
      new Request("https://api.cnmcp.com/v1/events", {
        method: "POST",
        headers: { Origin: ORIGIN, "Content-Type": "application/json" },
        body,
      }),
      env,
      NOW,
    );
    expect(response.status).toBe(status);
    expect((await json(response)).error).toEqual({ code, message: expect.any(String) });
  });

  it.each([
    [{ resourceId: "UPPER", eventType: "command_copy", eventId: "event-identifier-0001" }],
    [{ resourceId: "active-resource", eventType: "install", eventId: "event-identifier-0001" }],
    [{ resourceId: "active-resource", eventType: "source_visit", eventId: "short" }],
    [{ resourceId: "active-resource", eventType: "source_visit", eventId: "event-identifier-0001", extra: true }],
  ])("拒绝非法字段 %#", async (body) => {
    const request = new Request("https://api.cnmcp.com/v1/events", {
      method: "POST",
      headers: { Origin: ORIGIN, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    expect((await handleRequest(request, env, NOW)).status).toBe(400);
  });

  it.each([
    ["unknown-resource", 404],
    ["stopped-resource", 404],
  ])("未知或停用资源 %s 返回 404", async (resourceId, status) => {
    expect((await handleRequest(eventRequest(resourceId), env, NOW)).status).toBe(status);
  });

  it("只累计 command_copy/source_visit，并返回当前已提交统计", async () => {
    const copy = await handleRequest(eventRequest(), env, NOW);
    const visit = await handleRequest(eventRequest("active-resource", "source_visit", "event-identifier-0002"), env, NOW + 1);
    expect(await json(copy)).toMatchObject({ counted: true, stats: { commandCopies: 1, sourceVisits: 0, updatedAt: NOW } });
    expect(await json(visit)).toMatchObject({ counted: true, stats: { commandCopies: 1, sourceVisits: 1, updatedAt: NOW + 1 } });
  });

  it("同一 eventId 幂等，且 D1 不保存原 IP、UA 或原 eventId", async () => {
    const requestOne = eventRequest();
    requestOne.headers.set("User-Agent", "private-agent-value");
    const first = await handleRequest(requestOne, env, NOW);
    const second = await handleRequest(eventRequest(), env, NOW + 1);
    expect((await json(first)).counted).toBe(true);
    expect((await json(second)).counted).toBe(false);
    const receipt = await env.DB.prepare("SELECT event_key FROM metric_receipts").first<{ event_key: string }>();
    const rate = await env.DB.prepare("SELECT rate_key FROM metric_rate_limits").first<{ rate_key: string }>();
    const dump = JSON.stringify({ receipt, rate });
    expect(dump).not.toContain("event-identifier-0001");
    expect(dump).not.toContain("203.0.113.8");
    expect(dump).not.toContain("private-agent-value");
    expect(receipt?.event_key).toMatch(/^[a-f0-9]{64}$/);
  });

  it("并发唯一事件由触发器原子累计且不丢计数", async () => {
    const responses = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        handleRequest(eventRequest("active-resource", "command_copy", `parallel-event-${String(index).padStart(4, "0")}`), env, NOW + index),
      ),
    );
    expect(responses.every((response) => response.status === 200)).toBe(true);
    const stats = await env.DB.prepare("SELECT command_copies FROM resource_stats WHERE resource_id = ?1")
      .bind("active-resource")
      .first<{ command_copies: number }>();
    expect(stats?.command_copies).toBe(20);
  });

  it("原子限流在达到上限后返回 429 且不增加统计", async () => {
    const limitedEnv = testEnv({ EVENT_RATE_LIMIT_PER_HOUR: "2" });
    const statuses = [];
    for (let index = 0; index < 3; index += 1) {
      statuses.push(
        (await handleRequest(eventRequest("active-resource", "command_copy", `limited-event-${String(index).padStart(4, "0")}`), limitedEnv, NOW)).status,
      );
    }
    expect(statuses).toEqual([200, 200, 429]);
    const stats = await env.DB.prepare("SELECT command_copies FROM resource_stats WHERE resource_id = ?1")
      .bind("active-resource")
      .first<{ command_copies: number }>();
    expect(stats?.command_copies).toBe(2);
  });

  it.each([
    [undefined],
    ["base64url:c2hvcnQ"],
    ["plain-text-secret-that-is-long-enough-but-wrong-format"],
  ])("HASH_SALT 值为 %s 时拒绝写入", async (salt) => {
    const response = await handleRequest(eventRequest(), testEnv({ HASH_SALT: salt }), NOW);
    expect(response.status).toBe(500);
    expect(await json(response)).toEqual({
      error: { code: "CONFIGURATION_ERROR", message: "Service configuration is invalid" },
    });
    const stats = await env.DB.prepare("SELECT command_copies FROM resource_stats WHERE resource_id = ?1")
      .bind("active-resource")
      .first<{ command_copies: number }>();
    expect(stats?.command_copies).toBe(0);
  });

  it("D1 写失败返回固定 500 且不伪造统计", async () => {
    const brokenDb = { prepare: () => { throw new Error("sensitive SQL"); } } as unknown as D1Database;
    const response = await handleRequest(eventRequest(), testEnv({ DB: brokenDb }), NOW);
    expect(response.status).toBe(500);
    expect(await json(response)).toEqual({ error: { code: "INTERNAL_ERROR", message: "An internal error occurred" } });
  });

  it("日志仅包含允许字段，不泄露请求敏感值", async () => {
    const logger = vi.spyOn(console, "info").mockImplementation(() => undefined);
    await handleRequest(eventRequest(), env, NOW);
    const entry = JSON.parse(String(logger.mock.calls.at(-1)?.[0])) as Record<string, unknown>;
    expect(Object.keys(entry).sort()).toEqual(["durationMs", "errorCode", "path", "status"]);
    const serialized = JSON.stringify(entry);
    expect(serialized).not.toContain("event-identifier-0001");
    expect(serialized).not.toContain("203.0.113.8");
    expect(serialized).not.toContain(VALID_SALT);
  });
});

describe("GET /v1/stats", () => {
  it("无 ids 返回全部活跃资源，排除停用资源并 no-store", async () => {
    const response = await handleRequest(new Request("https://api.cnmcp.com/v1/stats"), env, NOW);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await json(response)).toEqual({
      generatedAt: NOW,
      resources: { "active-resource": { commandCopies: 0, sourceVisits: 0, updatedAt: 0 } },
    });
  });

  it("ids 去重并只返回存在且活跃的请求资源", async () => {
    const response = await handleRequest(
      new Request("https://api.cnmcp.com/v1/stats?ids=active-resource,active-resource,unknown-resource"),
      env,
      NOW,
    );
    expect(await json(response)).toEqual({
      generatedAt: NOW,
      resources: { "active-resource": { commandCopies: 0, sourceVisits: 0, updatedAt: 0 } },
    });
  });

  it("拒绝空 ids、非法 ids 和超过 100 个去重 ids", async () => {
    const tooMany = Array.from({ length: 101 }, (_, index) => `resource-${String(index).padStart(3, "0")}`).join(",");
    for (const url of [
      "https://api.cnmcp.com/v1/stats?ids=",
      "https://api.cnmcp.com/v1/stats?ids=INVALID",
      `https://api.cnmcp.com/v1/stats?ids=${tooMany}`,
    ]) {
      const response = await handleRequest(new Request(url), env, NOW);
      expect(response.status).toBe(400);
      expect((await json(response)).error).toEqual({ code: "INVALID_IDS", message: "Resource IDs are invalid" });
    }
  });

  it("D1 读取失败映射为固定 503", async () => {
    const brokenDb = { prepare: () => { throw new Error("sensitive SQL"); } } as unknown as D1Database;
    const response = await handleRequest(new Request("https://api.cnmcp.com/v1/stats"), testEnv({ DB: brokenDb }), NOW);
    expect(response.status).toBe(503);
    expect(await json(response)).toEqual({
      error: { code: "SERVICE_UNAVAILABLE", message: "Statistics are temporarily unavailable" },
    });
  });
});

describe("迁移、Catalog 同步与定时清理", () => {
  it("迁移创建四张表、索引、外键和计数触发器", async () => {
    const objects = await env.DB.prepare(
      "SELECT type, name FROM sqlite_master WHERE name LIKE 'resource_%' OR name LIKE 'metric_%' ORDER BY name",
    ).all<{ type: string; name: string }>();
    const names = new Set(objects.results.map((row) => `${row.type}:${row.name}`));
    for (const expected of [
      "table:resource_catalog",
      "table:resource_stats",
      "table:metric_receipts",
      "table:metric_rate_limits",
      "index:metric_receipts_expires_idx",
      "index:metric_rate_limits_expires_idx",
      "trigger:metric_receipts_increment_stats",
    ]) expect(names.has(expected)).toBe(true);
    const foreignKeys = await env.DB.prepare("PRAGMA foreign_key_list(metric_receipts)").all<{ table: string }>();
    expect(foreignKeys.results.some((row) => row.table === "resource_catalog")).toBe(true);
  });

  it("Catalog 重复同步保留累计值，新资源为零，旧资源停用但历史不删", async () => {
    await env.DB.prepare(
      "UPDATE resource_stats SET command_copies = 9, source_visits = 4, updated_at = ?1 WHERE resource_id = ?2",
    )
      .bind(NOW - 1, "active-resource")
      .run();
    const firstCatalog = {
      schemaVersion: 1,
      resources: [{ id: "active-resource" }, { id: "new-resource", visibility: "public" as const }],
    };
    await env.DB.exec(createCatalogSyncSql(firstCatalog, NOW));
    await env.DB.exec(createCatalogSyncSql(firstCatalog, NOW + 1));
    const rows = await env.DB.prepare(
      `SELECT c.resource_id, c.active, s.command_copies, s.source_visits
       FROM resource_catalog c JOIN resource_stats s ON s.resource_id = c.resource_id ORDER BY c.resource_id`,
    ).all<{ resource_id: string; active: number; command_copies: number; source_visits: number }>();
    expect(rows.results).toEqual([
      { resource_id: "active-resource", active: 1, command_copies: 9, source_visits: 4 },
      { resource_id: "new-resource", active: 1, command_copies: 0, source_visits: 0 },
      { resource_id: "stopped-resource", active: 0, command_copies: 0, source_visits: 0 },
    ]);

    await env.DB.exec(createCatalogSyncSql({ schemaVersion: 1, resources: [{ id: "new-resource" }] }, NOW + 2));
    const old = await env.DB.prepare(
      "SELECT c.active, s.command_copies FROM resource_catalog c JOIN resource_stats s USING(resource_id) WHERE c.resource_id = ?1",
    )
      .bind("active-resource")
      .first<{ active: number; command_copies: number }>();
    expect(old).toEqual({ active: 0, command_copies: 9 });
  });

  it("Cron 清理仅删除已过期回执和限流记录", async () => {
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO metric_receipts (event_key, resource_id, event_type, created_at, expires_at) VALUES (?1, ?2, ?3, ?4, ?5)",
      ).bind("expired-receipt", "active-resource", "command_copy", NOW - 2, NOW - 1),
      env.DB.prepare(
        "INSERT INTO metric_receipts (event_key, resource_id, event_type, created_at, expires_at) VALUES (?1, ?2, ?3, ?4, ?5)",
      ).bind("future-receipt", "active-resource", "source_visit", NOW, NOW + 1),
      env.DB.prepare(
        "INSERT INTO metric_rate_limits (rate_key, bucket_start, event_count, expires_at) VALUES (?1, ?2, 1, ?3)",
      ).bind("expired-rate", NOW, NOW - 1),
      env.DB.prepare(
        "INSERT INTO metric_rate_limits (rate_key, bucket_start, event_count, expires_at) VALUES (?1, ?2, 1, ?3)",
      ).bind("future-rate", NOW, NOW + 1),
    ]);
    await cleanupExpired(env, NOW);
    const receipts = await env.DB.prepare("SELECT event_key FROM metric_receipts ORDER BY event_key").all<{ event_key: string }>();
    const rates = await env.DB.prepare("SELECT rate_key FROM metric_rate_limits ORDER BY rate_key").all<{ rate_key: string }>();
    expect(receipts.results).toEqual([{ event_key: "future-receipt" }]);
    expect(rates.results).toEqual([{ rate_key: "future-rate" }]);
  });
});

describe("HASH_SALT 解码", () => {
  it("接受 base64url 编码的至少 32 字节值", () => {
    expect(decodeHashSalt(VALID_SALT)).toHaveLength(32);
    expect(decodeHashSalt(`base64url:${"a".repeat(44)}`).byteLength).toBeGreaterThanOrEqual(32);
  });
});
