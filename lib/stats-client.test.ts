import {
  STATS_REQUEST_TIMEOUT_MS,
  StatsClient,
  createEventId,
  recordStatsEvent,
} from "./stats-client";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function statsBody(resources: Record<string, unknown>) {
  return { generatedAt: 1_787_443_200_000, resources };
}

const value = { commandCopies: 3, sourceVisits: 4, updatedAt: 1_787_443_100_000 };

describe("StatsClient", () => {
  it("同一客户端合并规范化后相同的进行中请求，但完成后不持久缓存", async () => {
    let resolveFetch!: (result: Response) => void;
    const fetchImplementation = jest.fn(() => new Promise<Response>((resolve) => { resolveFetch = resolve; }));
    const client = new StatsClient({
      baseUrl: "https://stats.example.com",
      fetchImplementation: fetchImplementation as unknown as typeof fetch,
    });

    const first = client.load(["second-resource", "first-resource", "first-resource"]);
    const second = client.load(["first-resource", "second-resource"]);
    expect(second).toBe(first);
    expect(fetchImplementation).toHaveBeenCalledTimes(1);

    resolveFetch(response(statsBody({ "first-resource": value, "second-resource": value })));
    await first;

    fetchImplementation.mockResolvedValueOnce(response(statsBody({ "first-resource": value, "second-resource": value })));
    await client.load(["second-resource", "first-resource"]);
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });

  it("仅将 API 明确返回的 0/0 资源标记为空，缺失资源标记不可用", async () => {
    const fetchImplementation = jest.fn().mockResolvedValue(response(statsBody({
      "empty-resource": { commandCopies: 0, sourceVisits: 0, updatedAt: 0 },
    })));
    const client = new StatsClient({
      baseUrl: "https://stats.example.com",
      fetchImplementation: fetchImplementation as unknown as typeof fetch,
    });

    await expect(client.load(["empty-resource", "missing-resource"])).resolves.toEqual({
      "empty-resource": {
        status: "empty",
        value: { commandCopies: 0, sourceVisits: 0, updatedAt: 0 },
      },
      "missing-resource": { status: "unavailable" },
    });
  });

  it.each([
    ["503", response({ error: { code: "UNAVAILABLE", message: "Unavailable" } }, 503)],
    ["未知顶层字段", response({ ...statsBody({ "valid-resource": value }), cached: true })],
    ["负数计数", response(statsBody({ "valid-resource": { ...value, sourceVisits: -1 } }))],
    ["未请求资源", response(statsBody({ "other-resource": value }))],
  ])("拒绝%s响应", async (_label, invalidResponse) => {
    const client = new StatsClient({
      baseUrl: "https://stats.example.com",
      fetchImplementation: jest.fn().mockResolvedValue(invalidResponse) as unknown as typeof fetch,
    });
    await expect(client.load(["valid-resource"])).rejects.toThrow();
  });

  it("8 秒后中止 GET 并以超时失败", async () => {
    jest.useFakeTimers();
    const fetchImplementation = jest.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }));
    const client = new StatsClient({
      baseUrl: "https://stats.example.com",
      fetchImplementation: fetchImplementation as unknown as typeof fetch,
    });

    const request = client.load(["valid-resource"]);
    const rejection = expect(request).rejects.toThrow("超时");
    await jest.advanceTimersByTimeAsync(STATS_REQUEST_TIMEOUT_MS);
    await rejection;
    expect((fetchImplementation.mock.calls[0][1] as RequestInit).signal?.aborted).toBe(true);
    jest.useRealTimers();
  });
});

describe("统计事件客户端", () => {
  it("生成满足 Worker 长度和字符约束的随机 eventId", () => {
    const ids = new Set(Array.from({ length: 32 }, () => createEventId()));
    expect(ids.size).toBe(32);
    for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9._~-]{16,128}$/);
  });

  it("仅发送协议字段并严格验证成功响应", async () => {
    const fetchImplementation = jest.fn().mockResolvedValue(response({
      resourceId: "valid-resource",
      eventType: "command_copy",
      counted: true,
      stats: value,
    }));

    await recordStatsEvent("valid-resource", "command_copy", {
      baseUrl: "https://stats.example.com",
      eventId: "fixed-event-id-1234",
      fetchImplementation: fetchImplementation as unknown as typeof fetch,
    });

    const init = fetchImplementation.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({
      resourceId: "valid-resource",
      eventType: "command_copy",
      eventId: "fixed-event-id-1234",
    });
    expect(Object.keys(JSON.parse(init.body as string))).toHaveLength(3);
  });

  it("拒绝事件响应中的资源错配或额外字段", async () => {
    const fetchImplementation = jest.fn().mockResolvedValue(response({
      resourceId: "other-resource",
      eventType: "source_visit",
      counted: true,
      stats: value,
      extra: "not-allowed",
    }));
    await expect(recordStatsEvent("valid-resource", "source_visit", {
      baseUrl: "https://stats.example.com",
      eventId: "fixed-event-id-1234",
      fetchImplementation: fetchImplementation as unknown as typeof fetch,
    })).rejects.toThrow("协议");
  });
});
