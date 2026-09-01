import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { runDiscoveryCrawl, startDailyCrawl } from "../src/crawl";
import { handleRequest } from "../src/index";

const ORIGIN = "https://www.cnmcp.com";
const NOW = Date.parse("2026-08-31T12:00:00.000Z");

async function json(response: Response): Promise<Record<string, unknown>> {
  return response.json<Record<string, unknown>>();
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

function emptyCatalog(): Response {
  return jsonResponse({ schemaVersion: 1, resources: [], indexes: { kinds: {}, platforms: {}, tags: {} } });
}

async function clearDatabase(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM candidates"),
    env.DB.prepare("DELETE FROM promotions"),
    env.DB.prepare("DELETE FROM crawl_runs"),
  ]);
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
    );
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("GET 拒绝非法 Origin，但允许无 Origin 的服务端读取", async () => {
    const forbidden = await handleRequest(
      new Request("https://discovery.cnmcp.com/v1/discovery", { headers: { Origin: "https://attacker.example" } }),
      env,
    );
    const direct = await handleRequest(new Request("https://discovery.cnmcp.com/v1/discovery"), env);
    expect(forbidden.status).toBe(403);
    expect(direct.status).toBe(200);
    expect(await json(direct)).toEqual({ generatedAt: 0, items: [], nextCursor: null });
  });

  it("拒绝非法查询并返回未知路由", async () => {
    const invalid = await handleRequest(new Request("https://discovery.cnmcp.com/v1/discovery?kind=nope"), env);
    expect(invalid.status).toBe(400);
    expect((await json(invalid)).error).toEqual({ code: "INVALID_KIND", message: expect.any(String) });
    const unknownKind = await handleRequest(new Request("https://discovery.cnmcp.com/v1/discovery?kind=unknown"), env);
    expect(unknownKind.status).toBe(400);
    const missing = await handleRequest(new Request("https://discovery.cnmcp.com/v1/unknown"), env);
    expect(missing.status).toBe(404);
    expect(missing.headers.get("Cache-Control")).toBe("no-store");
  });
});

describe("发现列表与爬取写入", () => {
  it("爬取结果可按 kind 过滤，generatedAt 来自成功 crawl_runs，且响应不含内部 sources 字段", async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("registry.modelcontextprotocol.io")) {
        return jsonResponse({
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
        });
      }
      if (url.includes("/search/repositories")) return jsonResponse({ items: [] });
      if (url.includes("catalog.json")) return emptyCatalog();
      if (url.includes("/repos/acme/files-mcp")) {
        return jsonResponse({
          full_name: "acme/files-mcp",
          html_url: "https://github.com/acme/files-mcp",
          name: "files-mcp",
          description: "Files MCP server",
          stargazers_count: 80,
          forks_count: 2,
          pushed_at: "2026-08-01T00:00:00.000Z",
          topics: ["mcp-server"],
          license: { spdx_id: "MIT" },
        });
      }
      return new Response("not found", { status: 404 });
    };

    await runDiscoveryCrawl(env, { fetch: fetchImpl, sleep: async () => undefined, now: NOW });

    const list = await handleRequest(new Request("https://discovery.cnmcp.com/v1/discovery?kind=mcp&sort=stars"), env);
    expect(list.status).toBe(200);
    const payload = await json(list);
    expect(payload.generatedAt).toBe(NOW);
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

  it("一次拉取 catalog.json 匹配已收录仓库，且不把未能补到 star 的 Registry 条目写入 D1", async () => {
    const urls: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      urls.push(url);
      if (url.includes("registry.modelcontextprotocol.io")) {
        return jsonResponse({
          servers: [
            {
              server: {
                name: "io.acme/empty",
                description: "No stars yet",
                repository: { url: "https://github.com/acme/empty-mcp" },
              },
            },
          ],
          metadata: {},
        });
      }
      if (url.includes("/search/repositories")) return jsonResponse({ items: [] });
      if (url.includes("catalog.json")) {
        return jsonResponse({
          schemaVersion: 1,
          resources: [{ id: "listed-skill", repository: "https://github.com/acme/listed-skill" }],
          indexes: {},
        });
      }
      return new Response("not found", { status: 404 });
    };

    const stats = await runDiscoveryCrawl(env, { fetch: fetchImpl, sleep: async () => undefined, now: NOW });
    expect(stats.registry).toBe(1);
    expect(stats.upserted).toBe(0);
    expect(stats.catalogMatched).toBe(1);
    expect(urls.filter((url) => url.includes("/contents/")).length).toBe(0);
    expect(urls.filter((url) => url.includes("catalog.json")).length).toBe(1);

    const listed = await env.DB.prepare("SELECT COUNT(*) AS n FROM candidates").first<{ n: number }>();
    expect(listed?.n).toBe(0);
  });

  it("下次爬取会清掉快照中的旧行，但保留 promotions 避免重复开 Issue", async () => {
    await env.DB.prepare(
      `INSERT INTO candidates (
         repo_full_name, html_url, name, description, stars, forks, topics, kind,
         inferred_platforms, score, sources, promotion_status, first_seen_at, last_crawled_at
       ) VALUES ('acme/old-zero', 'https://github.com/acme/old-zero', 'old-zero', '', 0, 0, '[]', 'mcp', '[]', 10, '[]', 'none', 1, 1)`,
    ).run();
    await env.DB.prepare(
      `INSERT INTO promotions (repo_full_name, status, issue_number, catalog_id, updated_at)
       VALUES ('acme/hot-mcp', 'issued', 44, NULL, 1)`,
    ).run();

    let issuePosts = 0;
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.includes("registry.modelcontextprotocol.io")) {
        return jsonResponse({ servers: [], metadata: {} });
      }
      if (url.includes("/search/repositories")) {
        return jsonResponse({
          items: [
            {
              full_name: "acme/hot-mcp",
              html_url: "https://github.com/acme/hot-mcp",
              name: "hot-mcp",
              description: "MCP server",
              stargazers_count: 80,
              forks_count: 1,
              pushed_at: "2026-08-01T00:00:00.000Z",
              topics: ["mcp-server"],
              license: { spdx_id: "MIT" },
            },
          ],
        });
      }
      if (url.includes("catalog.json")) return emptyCatalog();
      if (url.includes("/issues") && init?.method === "POST") {
        issuePosts += 1;
        return jsonResponse({ number: 99 }, 201);
      }
      return new Response("not found", { status: 404 });
    };

    const stats = await runDiscoveryCrawl(env, { fetch: fetchImpl, sleep: async () => undefined, now: NOW });
    expect(stats.issued).toBe(0);
    expect(issuePosts).toBe(0);
    const old = await env.DB.prepare("SELECT COUNT(*) AS n FROM candidates WHERE repo_full_name = 'acme/old-zero'").first<{ n: number }>();
    expect(old?.n).toBe(0);
    const promotion = await env.DB.prepare("SELECT issue_number AS n FROM promotions WHERE repo_full_name = 'acme/hot-mcp'").first<{ n: number }>();
    expect(promotion?.n).toBe(44);
  });

  it("不把 unknown 仓库写入 D1", async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("registry.modelcontextprotocol.io")) return jsonResponse({ servers: [], metadata: {} });
      if (url.includes("/search/repositories")) {
        return jsonResponse({
          items: [
            {
              full_name: "acme/notes",
              html_url: "https://github.com/acme/notes",
              name: "notes",
              description: "Notes about Claude Code",
              stargazers_count: 500,
              forks_count: 10,
              pushed_at: "2026-08-01T00:00:00.000Z",
              topics: ["claude-code"],
              license: { spdx_id: "MIT" },
            },
          ],
        });
      }
      if (url.includes("catalog.json")) return emptyCatalog();
      return new Response("not found", { status: 404 });
    };

    const stats = await runDiscoveryCrawl(env, { fetch: fetchImpl, sleep: async () => undefined, now: NOW });
    expect(stats.upserted).toBe(0);
    const listed = await env.DB.prepare("SELECT COUNT(*) AS n FROM candidates").first<{ n: number }>();
    expect(listed?.n).toBe(0);
  });
});

describe("startDailyCrawl", () => {
  it("已完成实例当天不再创建", async () => {
    const workflow = {
      get: async () => ({ status: async () => ({ status: "complete" as const }) }),
      create: async () => {
        throw new Error("should not create");
      },
    };
    await expect(startDailyCrawl({ ...env, DISCOVERY_WORKFLOW: workflow } as unknown as WorkerEnv, NOW)).resolves.toBe("already");
  });

  it("失败实例用新 id 重跑，非冲突错误向上抛出", async () => {
    const created: string[] = [];
    const retryable = {
      get: async () => ({ status: async () => ({ status: "errored" as const }) }),
      create: async (input: { id: string }) => {
        created.push(input.id);
      },
    };
    await expect(startDailyCrawl({ ...env, DISCOVERY_WORKFLOW: retryable } as unknown as WorkerEnv, NOW)).resolves.toBe("started");
    expect(created[0]).toMatch(/^crawl-2026-08-31-retry-/);

    const failing = {
      get: async () => {
        throw new Error("missing");
      },
      create: async () => {
        throw new Error("binding missing");
      },
    };
    await expect(startDailyCrawl({ ...env, DISCOVERY_WORKFLOW: failing } as unknown as WorkerEnv, NOW)).rejects.toThrow("binding missing");
  });
});
