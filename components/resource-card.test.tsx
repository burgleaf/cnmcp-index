import { renderToStaticMarkup } from "react-dom/server";

import type { Resource } from "@/lib/catalog-types";

import { ResourceCard } from "./resource-card";

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
  it("展示用途、标签和质量，不展示平台或本站收录时间", () => {
    const html = renderToStaticMarkup(<ResourceCard resource={resource} />);
    expect(html).toContain("测试 MCP");
    expect(html).toContain('href="/resources/test-mcp"');
    expect(html).toContain("用于验证资源卡片全部必需字段");
    expect(html).toContain("上下文");
    expect(html).toContain("综合质量");
    expect(html).not.toContain("Codex");
    expect(html).not.toContain("Claude Code");
    expect(html).not.toContain("收录日期");
    expect(html).not.toContain("统计服务");
  });
});
