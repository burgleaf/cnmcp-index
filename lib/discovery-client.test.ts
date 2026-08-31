import { DiscoveryClient } from "./discovery-client";

function validItem(overrides: Record<string, unknown> = {}) {
  return {
    repoFullName: "acme/files-mcp",
    htmlUrl: "https://github.com/acme/files-mcp",
    name: "files-mcp",
    description: "Files",
    stars: 80,
    kind: "mcp",
    inferredPlatforms: ["claude-code"],
    score: 41.2,
    pushedAt: "2026-08-01T00:00:00.000Z",
    catalogId: null,
    ...overrides,
  };
}

describe("DiscoveryClient", () => {
  it("解析合法列表并拒绝多余字段", async () => {
    const fetchImplementation = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ generatedAt: 10, items: [validItem()], nextCursor: "30" }),
    });
    const list = await new DiscoveryClient({
      baseUrl: "https://discovery.cnmcp.com",
      fetchImplementation,
    }).list({ kind: "mcp", sort: "stars" });
    expect(fetchImplementation).toHaveBeenCalledWith(
      "https://discovery.cnmcp.com/v1/discovery?kind=mcp&sort=stars",
      expect.objectContaining({ method: "GET" }),
    );
    expect(list.items).toHaveLength(1);
    expect(list.nextCursor).toBe("30");
  });

  it("协议不匹配或 HTTP 错误时抛出中文错误", async () => {
    await expect(
      new DiscoveryClient({
        baseUrl: "https://discovery.cnmcp.com",
        fetchImplementation: jest.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ generatedAt: 10, items: [validItem({ sources: ["secret"] })], nextCursor: null }),
        }),
      }).list(),
    ).rejects.toThrow("发现响应不符合协议");
    await expect(
      new DiscoveryClient({
        baseUrl: "https://discovery.cnmcp.com",
        fetchImplementation: jest.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) }),
      }).list(),
    ).rejects.toThrow("HTTP 503");
  });
});
