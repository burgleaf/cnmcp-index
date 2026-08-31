import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { runDiscoveryCrawl } from "../src/crawl";
import { handleRequest } from "../src/index";

const ORIGIN = "https://www.cnmcp.com";
const NOW = Date.parse("2026-08-31T12:00:00.000Z");

async function json(response: Response): Promise<Record<string, unknown>> {
  return response.json<Record<string, unknown>>();
}

async function clearDatabase(): Promise<void> {
  await env.DB.batch([env.DB.prepare("DELETE FROM candidates"), env.DB.prepare("DELETE FROM crawl_runs")]);
}

beforeEach(async () => {
  vi.restoreAllMocks();
  await clearDatabase();
});

describe("CORS 与 GET /v1/discovery", () => {
  it("允许配置 Origin 的预检并对所有响应禁用缓存", async () => {
    const response = await handleRequest(
      new Request("https://discovery.cnmcp.com/v1/discovery", { method: "OPTIONS", headers: { Origin: ORIGIN } }),
      env,
      NOW,
    );
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("GET 拒绝非法 Origin，但允许无 Origin 的服务端读取", async () => {
    const forbidden = await handleRequest(
      new Request("https://discovery.cnmcp.com/v1/discovery", { headers: { Origin: "https://attacker.example" } }),
      env,
      NOW,
    );
    const direct = await handleRequest(new Request("https://discovery.cnmcp.com/v1/discovery"), env, NOW);
    expect(forbidden.status).toBe(403);
    expect(direct.status).toBe(200);
    expect(await json(direct)).toEqual({ generatedAt: NOW, items: [], nextCursor: null });
  });

  it("拒绝非法查询并返回未知路由", async () => {
    const invalid = await handleRequest(new Request("https://discovery.cnmcp.com/v1/discovery?kind=nope"), env, NOW);
    expect(invalid.status).toBe(400);
    expect((await json(invalid)).error).toEqual({ code: "INVALID_KIND", message: expect.any(String) });
    const missing = await handleRequest(new Request("https://discovery.cnmcp.com/v1/unknown"), env, NOW);
    expect(missing.status).toBe(404);
    expect(missing.headers.get("Cache-Control")).toBe("no-store");
  });
});

describe("发现列表与爬取写入", () => {
  it("爬取结果可按 kind 过滤，且响应不含内部 sources 字段", async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("registry.modelcontextprotocol.io")) {
        return new Response(
          JSON.stringify({
            servers: [
              {
                server: {
                  name: "io.acme/files",
                  description: "Files MCP server",
                  repository: { url: "https://github.com/acme/files-mcp" },
                },
              },
            ],
            metadata: {},
          }),
          { status: 200 },
        );
      }
      if (url.includes("/search/repositories")) {
        return new Response(JSON.stringify({ items: [] }), { status: 200 });
      }
      if (url.includes("/git/trees/HEAD")) {
        return new Response(JSON.stringify({ tree: [] }), { status: 200 });
      }
      if (url.includes("/repos/acme/files-mcp")) {
        return new Response(
          JSON.stringify({
            full_name: "acme/files-mcp",
            html_url: "https://github.com/acme/files-mcp",
            name: "files-mcp",
            description: "Files MCP server",
            stargazers_count: 80,
            forks_count: 2,
            pushed_at: "2026-08-01T00:00:00.000Z",
            topics: ["mcp-server"],
            license: { spdx_id: "MIT" },
          }),
          { status: 200 },
        );
      }
      return new Response("not found", { status: 404 });
    };

    await runDiscoveryCrawl(env, { fetch: fetchImpl, sleep: async () => undefined, now: NOW });

    const list = await handleRequest(new Request("https://discovery.cnmcp.com/v1/discovery?kind=mcp&sort=stars"), env, NOW);
    expect(list.status).toBe(200);
    const payload = await json(list);
    expect(Array.isArray(payload.items)).toBe(true);
    const item = (payload.items as Record<string, unknown>[])[0];
    expect(item).toMatchObject({
      repoFullName: "acme/files-mcp",
      htmlUrl: "https://github.com/acme/files-mcp",
      kind: "mcp",
      catalogId: null,
    });
    expect(item).not.toHaveProperty("sources");
    expect(item).not.toHaveProperty("issueNumber");
  });
});
