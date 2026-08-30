import { renderToStaticMarkup } from "react-dom/server";

import type { Platform, Resource } from "@/lib/catalog-types";

import { ResourceCard } from "./resource-card";

const platforms: ReadonlyArray<Platform> = [
  { id: "codex", name: "Codex", homepage: "https://example.com/codex", icon: "/platforms/codex.svg", enabled: true, sortOrder: 10 },
  { id: "claude-code", name: "Claude Code", homepage: "https://example.com/claude", icon: "/platforms/claude.svg", enabled: true, sortOrder: 20 },
];

const resource: Resource = {
  schemaVersion: 1,
  id: "test-mcp",
  kind: "mcp",
  name: "测试 MCP",
  summary: "用于验证资源卡片全部必需字段。",
  repository: "https://example.com/repo",
  license: "MIT",
  author: { name: "作者" },
  tags: ["context", "testing"],
  compatibility: [{ platform: "codex", status: "partial", verifiedAt: "2026-01-02", note: "部分能力受限" }],
  createdAt: "2026-01-01",
  featured: true,
};

describe("ResourceCard", () => {
  it("展示字段、统计占位，并把未声明平台准确显示为未知", () => {
    const html = renderToStaticMarkup(<ResourceCard platforms={platforms} resource={resource} />);
    expect(html).toContain("测试 MCP");
    expect(html).toContain('href="/resources/test-mcp"');
    expect(html).toContain("用于验证资源卡片全部必需字段");
    expect(html).toContain("#context");
    expect(html).toContain("Codex：部分支持，最后核验日期 2026-01-02");
    expect(html).toContain("Claude Code：兼容性未知");
    expect(html).toContain("统计服务暂不可用");
    expect(html).toContain("不能按 0 展示");
  });
});
