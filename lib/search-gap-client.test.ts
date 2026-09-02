import {
  SEARCH_GAP_REQUEST_TIMEOUT_MS,
  recordSearchGapEvent,
  sanitizeTaskQuery,
} from "./search-gap-client";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("搜索缺口查询清洗", () => {
  it("规范化空白、大小写与兼容字符", () => {
    expect(sanitizeTaskQuery("  ＣＯＤＥ   Review  ")).toBe("code review");
    expect(sanitizeTaskQuery("  代码   审查  ")).toBe("代码 审查");
  });

  it("隐藏邮箱和 URL，限制保存长度", () => {
    const sanitized = sanitizeTaskQuery(`联系 user@example.com 阅读 https://example.com/private ${"任务".repeat(80)}`);
    expect(sanitized).toContain("[email]");
    expect(sanitized).toContain("[url]");
    expect(sanitized).not.toContain("user@example.com");
    expect(sanitized).not.toContain("example.com/private");
    expect(Array.from(sanitized ?? "")).toHaveLength(80);
  });

  it.each([
    "sk-abcdefghijklmnopqrstuvwx",
    "ghp_abcdefghijklmnopqrstuvwxyz123456",
    "Bearer abcdefghijklmnopqrstuvwxyz123456",
  ])("包含疑似密钥时不允许上报：%s", (query) => {
    expect(sanitizeTaskQuery(query)).toBeNull();
  });

  it.each(["", " ", "a", "中"])("忽略过短查询：%j", (query) => {
    expect(sanitizeTaskQuery(query)).toBeNull();
  });
});

describe("搜索缺口事件客户端", () => {
  it("只发送清洗后的任务、结果数、筛选条件和随机事件 ID", async () => {
    const fetchImplementation = jest.fn().mockResolvedValue(response({
      gapId: "gap-0123456789abcdef01234567",
      counted: true,
      bucket: "zero",
    }));

    await expect(recordSearchGapEvent({
      query: "  代码   审查 user@example.com ",
      resultCount: 0,
      kind: "plugin",
      tag: "code-review",
    }, {
      baseUrl: "https://stats.example.com",
      eventId: "fixed-event-id-1234",
      fetchImplementation: fetchImplementation as unknown as typeof fetch,
    })).resolves.toBe(true);

    const [url, init] = fetchImplementation.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://stats.example.com/v1/search-events");
    expect(JSON.parse(init.body as string)).toEqual({
      query: "代码 审查 [email]",
      resultCount: 0,
      kind: "plugin",
      tag: "code-review",
      eventId: "fixed-event-id-1234",
    });
    expect(init.keepalive).toBe(false);
  });

  it("查询不可记录时静默跳过网络请求", async () => {
    const fetchImplementation = jest.fn();
    await expect(recordSearchGapEvent({ query: "sk-abcdefghijklmnopqrstuvwx", resultCount: 0 }, {
      fetchImplementation: fetchImplementation as unknown as typeof fetch,
    })).resolves.toBe(false);
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it.each([
    ["HTTP 错误", response({ error: "unavailable" }, 503)],
    ["额外字段", response({ gapId: "gap-0123456789abcdef01234567", counted: true, bucket: "zero", extra: true })],
    ["非法缺口 ID", response({ gapId: "unsafe", counted: true, bucket: "zero" })],
    ["非法分桶", response({ gapId: "gap-0123456789abcdef01234567", counted: true, bucket: "unknown" })],
  ])("拒绝%s响应", async (_label, invalidResponse) => {
    const fetchImplementation = jest.fn().mockResolvedValue(invalidResponse);
    await expect(recordSearchGapEvent({ query: "代码审查", resultCount: 0 }, {
      eventId: "fixed-event-id-1234",
      fetchImplementation: fetchImplementation as unknown as typeof fetch,
    })).rejects.toThrow();
  });

  it("超时后中止请求", async () => {
    jest.useFakeTimers();
    const fetchImplementation = jest.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }));
    const request = recordSearchGapEvent({ query: "代码审查", resultCount: 0 }, {
      eventId: "fixed-event-id-1234",
      fetchImplementation: fetchImplementation as unknown as typeof fetch,
    });
    const rejection = expect(request).rejects.toThrow("超时");
    await jest.advanceTimersByTimeAsync(SEARCH_GAP_REQUEST_TIMEOUT_MS);
    await rejection;
    expect((fetchImplementation.mock.calls[0][1] as RequestInit).signal?.aborted).toBe(true);
    jest.useRealTimers();
  });
});
