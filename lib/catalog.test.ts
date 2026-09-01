import { createCatalogAccess } from "./catalog";
import type { GeneratedCatalog, Resource, ResourceVisibility } from "./catalog-types";

function resource(id: string, visibility: ResourceVisibility = "public"): Resource {
  return {
    schemaVersion: 1,
    id,
    kind: id.includes("skill") ? "skill" : "mcp",
    name: id,
    summary: `${id} 是用于测试构建期目录访问的数据。`,
    repository: `https://example.com/${id}`,
    license: "MIT",
    author: { name: "测试作者" },
    tags: id.includes("skill") ? ["testing"] : ["context"],
    compatibility: [{ platform: "codex", status: "supported", verifiedAt: "2026-01-01" }],
    createdAt: "2026-01-01",
    visibility,
    featured: false,
  };
}

const catalog: GeneratedCatalog = {
  schemaVersion: 1,
  resources: [resource("public-mcp"), resource("hidden-skill", "unlisted"), resource("removed-mcp", "removed")],
  indexes: {
    kinds: { mcp: ["public-mcp", "removed-mcp"], skill: ["hidden-skill"], plugin: [] },
    platforms: { codex: ["public-mcp", "hidden-skill", "removed-mcp"] },
    tags: { context: ["public-mcp", "removed-mcp"], testing: ["hidden-skill"] },
  },
  platforms: [
    { id: "claude-code", name: "Claude Code", homepage: "https://example.com/claude", icon: "/platforms/claude.svg", enabled: true, sortOrder: 20 },
    { id: "codex", name: "Codex", homepage: "https://example.com/codex", icon: "/platforms/codex.svg", enabled: true, sortOrder: 10 },
    { id: "disabled", name: "Disabled", homepage: "https://example.com/disabled", icon: "/platforms/disabled.svg", enabled: false, sortOrder: 30 },
  ],
  tags: [
    { id: "testing", name: "测试", nameEn: "Testing", description: "测试", aliases: [], group: "task", sortOrder: 20 },
    { id: "context", name: "上下文", nameEn: "Context", description: "上下文", aliases: [], group: "capability", sortOrder: 10 },
  ],
};

describe("构建期 Catalog 数据访问", () => {
  const access = createCatalogAccess(catalog);

  it("所有读取入口一致排除 unlisted 和 removed", () => {
    expect(access.getAllResources().map(({ id }) => id)).toEqual(["public-mcp"]);
    expect(access.getResourceById("hidden-skill")).toBeNull();
    expect(access.getResourceById("removed-mcp")).toBeNull();
    expect(access.getResourcesByKind("mcp").map(({ id }) => id)).toEqual(["public-mcp"]);
    expect(access.getResourcesByPlatform("codex").map(({ id }) => id)).toEqual(["public-mcp"]);
    expect(access.getResourcesByTag("context").map(({ id }) => id)).toEqual(["public-mcp"]);
  });

  it("按 sortOrder 返回平台并只枚举真正使用的公开标签", () => {
    expect(access.getAllPlatforms().map(({ id }) => id)).toEqual(["codex", "claude-code", "disabled"]);
    expect(access.getEnabledPlatforms().map(({ id }) => id)).toEqual(["codex", "claude-code"]);
    expect(access.getUsedTags()).toEqual([{ id: "context", name: "上下文", nameEn: "Context", description: "上下文", aliases: [], group: "capability", sortOrder: 10 }]);
  });

  it("未知 ID、平台和标签返回空结果", () => {
    expect(access.getResourceById("missing")).toBeNull();
    expect(access.getResourcesByPlatform("missing")).toEqual([]);
    expect(access.getResourcesByTag("missing")).toEqual([]);
  });
});
