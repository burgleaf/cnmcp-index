import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import {
  computeGapPriorityScore,
  handleRequest,
  refreshTaskGaps,
} from "../src/index";

const ORIGIN = "https://www.cnmcp.com";
const NOW = 1_800_000_000_000;

function searchRequest(
  query = "代码审查",
  resultCount = 0,
  eventId = "search-event-id-0001",
  extra: Record<string, unknown> = {},
): Request {
  return new Request("https://api.cnmcp.com/v1/search-events", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: ORIGIN,
      "CF-Connecting-IP": "203.0.113.42",
      "User-Agent": "private-browser-value",
    },
    body: JSON.stringify({ query, resultCount, eventId, ...extra }),
  });
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return response.json<Record<string, unknown>>();
}

async function clearTaskGaps(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM search_event_receipts"),
    env.DB.prepare("DELETE FROM task_gap_ledger"),
    env.DB.prepare("DELETE FROM task_gaps"),
    env.DB.prepare("DELETE FROM metric_rate_limits"),
  ]);
}

beforeEach(clearTaskGaps);

describe("POST /v1/search-events", () => {
  it("将零结果搜索聚合为不包含用户标识的稳定缺口", async () => {
    const response = await handleRequest(searchRequest("  代码   审查 user@example.com https://example.com/private "), env, NOW);
    expect(response.status).toBe(200);
    const payload = await json(response);
    expect(payload).toEqual({
      gapId: expect.stringMatching(/^gap-[a-f0-9]{24}$/),
      counted: true,
      bucket: "zero",
    });

    const gap = await env.DB.prepare(
      `SELECT gap_id, normalized_query, resource_kind, tag_id, status,
              search_count, zero_result_count, low_result_count, min_result_count
       FROM task_gaps`,
    ).first<Record<string, unknown>>();
    expect(gap).toEqual({
      gap_id: payload.gapId,
      normalized_query: "代码 审查 [email] [url]",
      resource_kind: null,
      tag_id: null,
      status: "observed",
      search_count: 1,
      zero_result_count: 1,
      low_result_count: 0,
      min_result_count: 0,
    });

    const dump = JSON.stringify(await env.DB.prepare("SELECT * FROM search_event_receipts").first());
    expect(dump).not.toContain("search-event-id-0001");
    expect(dump).not.toContain("203.0.113.42");
    expect(dump).not.toContain("private-browser-value");
    expect(dump).not.toContain("user@example.com");
    expect(dump).not.toContain("example.com/private");
  });

  it("相同查询和筛选得到同一 gapId，重复 eventId 不重复计数", async () => {
    const first = await handleRequest(searchRequest("CODE  review", 1, "search-event-id-0001", {
      kind: "plugin",
      tag: "code-review",
    }), env, NOW);
    const duplicate = await handleRequest(searchRequest("code review", 1, "search-event-id-0001", {
      kind: "plugin",
      tag: "code-review",
    }), env, NOW + 1);
    const unique = await handleRequest(searchRequest("code review", 4, "search-event-id-0002", {
      kind: "plugin",
      tag: "code-review",
    }), env, NOW + 2);
    const firstBody = await json(first);
    expect(await json(duplicate)).toMatchObject({ gapId: firstBody.gapId, counted: false, bucket: "low" });
    expect(await json(unique)).toMatchObject({ gapId: firstBody.gapId, counted: true, bucket: "healthy" });

    const gap = await env.DB.prepare(
      `SELECT search_count, zero_result_count, low_result_count, min_result_count
       FROM task_gaps WHERE gap_id = ?1`,
    ).bind(firstBody.gapId).first<Record<string, number>>();
    expect(gap).toEqual({ search_count: 2, zero_result_count: 0, low_result_count: 1, min_result_count: 1 });

    const differentFilter = await json(await handleRequest(searchRequest("code review", 1, "search-event-id-0003", {
      kind: "mcp",
      tag: "code-review",
    }), env, NOW + 3));
    expect(differentFilter.gapId).not.toBe(firstBody.gapId);
  });

  it.each([
    [{ query: "a", resultCount: 0, eventId: "search-event-id-0001" }],
    [{ query: "sk-abcdefghijklmnopqrstuvwx", resultCount: 0, eventId: "search-event-id-0001" }],
    [{ query: "代码审查", resultCount: -1, eventId: "search-event-id-0001" }],
    [{ query: "代码审查", resultCount: 0.5, eventId: "search-event-id-0001" }],
    [{ query: "代码审查", resultCount: 0, eventId: "short" }],
    [{ query: "代码审查", resultCount: 0, eventId: "search-event-id-0001", kind: "tool" }],
    [{ query: "代码审查", resultCount: 0, eventId: "search-event-id-0001", tag: "UPPER" }],
    [{ query: "代码审查", resultCount: 0, eventId: "search-event-id-0001", extra: true }],
  ])("拒绝不可记录或非法字段 %#", async (body) => {
    const response = await handleRequest(new Request("https://api.cnmcp.com/v1/search-events", {
      method: "POST",
      headers: { Origin: ORIGIN, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }), env, NOW);
    expect(response.status).toBe(400);
    expect((await json(response)).error).toEqual({ code: "INVALID_REQUEST", message: expect.any(String) });
  });
});

describe("缺口优先级与状态台账", () => {
  it("优先级同时反映需求量、零结果比例和资源稀缺度", () => {
    expect(computeGapPriorityScore({ searchCount: 3, zeroResultCount: 3, lowResultCount: 0, minResultCount: 0 })).toBe(73.9);
    expect(computeGapPriorityScore({ searchCount: 3, zeroResultCount: 0, lowResultCount: 3, minResultCount: 1 })).toBe(43.9);
    expect(computeGapPriorityScore({ searchCount: 1000, zeroResultCount: 1000, lowResultCount: 0, minResultCount: 0 })).toBe(100);
  });

  it("每日刷新达到阈值时只升级一次并记录可追踪台账", async () => {
    for (let index = 1; index <= 3; index += 1) {
      await handleRequest(searchRequest("导演分镜", 0, `search-event-id-000${index}`), env, NOW + index);
    }

    await refreshTaskGaps(env, NOW + 10);
    await refreshTaskGaps(env, NOW + 20);

    const gap = await env.DB.prepare(
      `SELECT gap_id, status, priority_score, qualified_at, search_count
       FROM task_gaps WHERE normalized_query = ?1`,
    ).bind("导演分镜").first<Record<string, unknown>>();
    expect(gap).toMatchObject({ status: "qualified", priority_score: 73.9, qualified_at: NOW + 10, search_count: 3 });

    const ledger = await env.DB.prepare(
      `SELECT event_type, COUNT(*) AS count FROM task_gap_ledger
       WHERE gap_id = ?1 GROUP BY event_type ORDER BY event_type`,
    ).bind(gap?.gap_id).all<{ event_type: string; count: number }>();
    expect(ledger.results).toEqual([
      { event_type: "observed", count: 1 },
      { event_type: "qualified", count: 1 },
    ]);
  });

  it("迁移创建缺口、事件回执、台账、索引和聚合触发器", async () => {
    const objects = await env.DB.prepare(
      `SELECT type, name FROM sqlite_master
       WHERE name LIKE 'task_gap%' OR name LIKE 'search_event%'
       ORDER BY name`,
    ).all<{ type: string; name: string }>();
    const names = new Set(objects.results.map((row) => `${row.type}:${row.name}`));
    for (const expected of [
      "table:search_event_receipts",
      "table:task_gap_ledger",
      "table:task_gaps",
      "index:search_event_receipts_expires_idx",
      "index:task_gaps_priority_idx",
      "trigger:search_event_receipts_aggregate_gap",
      "trigger:search_event_receipts_observe_gap",
    ]) expect(names.has(expected)).toBe(true);
  });
});
