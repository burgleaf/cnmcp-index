import type { CatalogFilters } from "./catalog-search";
import {
  DEFAULT_CATALOG_FILTERS,
  fetchClientCatalog,
  filterAndSortResources,
  hasActiveFilters,
  normalizeSearchText,
} from "./catalog-search";
import type { ResourceSummary } from "./catalog-types";

const resources: ReadonlyArray<ResourceSummary> = [
  {
    id: "zeta-skill",
    kind: "skill",
    name: "代码审查助手",
    nameEn: "Review Helper",
    summary: "帮助团队检查代码质量",
    summaryEn: "Review source code",
    authorName: "CNMCP 团队",
    tags: ["code-quality", "testing"],
    platforms: [{ id: "codex", status: "native" }],
    createdAt: "2026-03-01",
    updatedAt: "2026-08-01",
    featured: false,
    quality: { score: 68, stars: 120, forks: 10, pushedAt: "2026-08-01T00:00:00Z", archived: false, breakdown: { stars: 20, activity: 25, forks: 3, completeness: 10, editorial: 0 } },
  },
  {
    id: "alpha-mcp",
    kind: "mcp",
    name: "Context Bridge",
    summary: "连接数据库上下文",
    authorName: "Alice",
    tags: ["context", "database"],
    platforms: [{ id: "claude-code", status: "partial" }, { id: "codex", status: "supported" }],
    createdAt: "2026-02-01",
    featured: true,
    quality: { score: 92, stars: 3200, forks: 240, pushedAt: "2026-08-20T00:00:00Z", archived: false, breakdown: { stars: 35, activity: 25, forks: 7, completeness: 15, editorial: 10 } },
  },
  {
    id: "beta-plugin",
    kind: "plugin",
    name: "Context Bridge",
    summary: "编辑器上下文插件",
    authorName: "Bob",
    tags: ["context"],
    platforms: [{ id: "claude-code", status: "supported" }],
    createdAt: "2026-02-01",
    featured: false,
    quality: { score: 55, stars: 80, forks: 4, pushedAt: "2025-01-01T00:00:00Z", archived: false, breakdown: { stars: 15, activity: 5, forks: 2, completeness: 10, editorial: 0 } },
  },
];

function filters(overrides: Partial<CatalogFilters>): CatalogFilters {
  return { ...DEFAULT_CATALOG_FILTERS, ...overrides };
}

describe("客户端目录发现逻辑", () => {
  it("执行 Unicode 规范化及中文、英文大小写无关子串搜索", () => {
    expect(normalizeSearchText("  ＲＥＶＩＥＷ\tHelper ")).toBe("review helper");
    expect(filterAndSortResources(resources, filters({ keyword: "代码质量" })).map(({ id }) => id)).toEqual(["zeta-skill"]);
    expect(filterAndSortResources(resources, filters({ keyword: "rEvIeW HeLp" })).map(({ id }) => id)).toEqual(["zeta-skill"]);
    expect(filterAndSortResources(resources, filters({ keyword: "alice" })).map(({ id }) => id)).toEqual(["alpha-mcp"]);
  });

  it("只保留面向用户的类型和标签筛选", () => {
    expect(filterAndSortResources(resources, filters({ kind: "mcp", tag: "context" })).map(({ id }) => id)).toEqual(["alpha-mcp"]);
    expect(filterAndSortResources(resources, filters({ kind: "plugin", tag: "testing" }))).toEqual([]);
  });

  it("默认按综合质量排序，并支持 Stars、活跃度和名称排序", () => {
    expect(filterAndSortResources(resources, filters({ sort: "quality" })).map(({ id }) => id)).toEqual(["alpha-mcp", "zeta-skill", "beta-plugin"]);
    expect(filterAndSortResources(resources, filters({ sort: "stars" })).map(({ id }) => id)).toEqual(["alpha-mcp", "zeta-skill", "beta-plugin"]);
    expect(filterAndSortResources(resources, filters({ sort: "active" })).map(({ id }) => id)).toEqual(["alpha-mcp", "zeta-skill", "beta-plugin"]);
    expect(filterAndSortResources(resources, filters({ sort: "name" })).map(({ id }) => id)).toEqual(["alpha-mcp", "beta-plugin", "zeta-skill"]);
    expect(filterAndSortResources([...resources].reverse(), filters({ sort: "name" })).map(({ id }) => id)).toEqual(["alpha-mcp", "beta-plugin", "zeta-skill"]);
  });

  it("空结果保持可清除筛选状态", () => {
    const active = filters({ keyword: "不存在的资源", kind: "plugin" });
    expect(filterAndSortResources(resources, active)).toEqual([]);
    expect(hasActiveFilters(active)).toBe(true);
    expect(hasActiveFilters(DEFAULT_CATALOG_FILTERS)).toBe(false);
  });

  it("只从静态 /catalog.json 读取目录并校验协议", async () => {
    const clientCatalog = { schemaVersion: 1 as const, resources: [], indexes: { kinds: {}, platforms: {}, tags: {} } };
    const fetcher = jest.fn(async () => ({ ok: true, status: 200, json: async () => clientCatalog }) as Response);
    await expect(fetchClientCatalog(fetcher)).resolves.toEqual(clientCatalog);
    expect(fetcher).toHaveBeenCalledWith("/catalog.json", { headers: { Accept: "application/json" } });
  });

  it("property: 任意类型与标签组合的结果都满足每个已选维度", () => {
    const kinds = ["", "mcp", "skill", "plugin"] as const;
    const tags = ["", "context", "testing"] as const;
    for (const kind of kinds) for (const tag of tags) {
      const result = filterAndSortResources(resources, filters({ kind, tag }));
      for (const resource of result) {
        expect(!kind || resource.kind === kind).toBe(true);
        expect(!tag || resource.tags.includes(tag)).toBe(true);
      }
    }
  });
});
