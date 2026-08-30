import type { Platform, Resource } from "@/lib/catalog-types";

export const detailFixturePlatforms: ReadonlyArray<Platform> = [
  { id: "codex", name: "Codex", homepage: "https://example.com/codex", icon: "/platforms/codex.svg", enabled: true, sortOrder: 10 },
  { id: "claude-code", name: "Claude Code", homepage: "https://example.com/claude-code", icon: "/platforms/claude-code.svg", enabled: true, sortOrder: 20 },
  { id: "registered-ai", name: "注册平台", homepage: "https://example.com/registered", icon: "/platforms/registered.svg", enabled: false, sortOrder: 30 },
];

export const detailFixtureResource: Resource = {
  schemaVersion: 1,
  id: "fixture-mcp",
  kind: "mcp",
  name: "隔离详情 Fixture",
  nameEn: "Isolated Detail Fixture",
  summary: "用于验证资源详情静态 HTML，不会写入正式 Catalog。",
  repository: "https://example.com/source",
  homepage: "https://example.com/home",
  documentation: "https://example.com/docs",
  license: "MIT",
  author: { name: "Fixture 作者", url: "https://example.com/author" },
  tags: ["context", "testing"],
  compatibility: [
    {
      platform: "codex",
      status: "native",
      verifiedAt: "2026-02-01",
      installations: [{
        type: "command",
        label: "Codex 命令",
        shell: "bash",
        command: "tool install --token {{TOKEN_VALUE}}",
        target: "项目根目录终端",
        placeholders: [{ name: "TOKEN_VALUE", description: "访问令牌", secret: true }],
      }],
    },
    {
      platform: "claude-code",
      status: "partial",
      verifiedAt: "2026-02-02",
      note: "仅支持本地项目配置。",
      installations: [{
        type: "config",
        label: "Claude Code 配置",
        content: "{\"endpoint\":\"{{SERVICE_URL}}\"}",
        target: "~/.claude/settings.json",
        placeholders: [{ name: "SERVICE_URL", description: "服务地址", secret: false }],
      }],
    },
    {
      platform: "registered-ai",
      status: "supported",
      verifiedAt: "2026-02-03",
      installations: [
        { type: "manual", content: "在平台注册页中启用扩展。", target: "平台注册页" },
        { type: "link", url: "https://example.com/install", label: "平台市场" },
      ],
    },
  ],
  createdAt: "2026-01-01",
  updatedAt: "2026-02-03",
  visibility: "public",
  featured: true,
  preview: "/resource-assets/fixture-mcp/preview.webp",
  readme: "## 安全说明\n\n支持 **GFM** 与 ~~删除线~~。\n\n[外部文档](https://example.com/guide)",
};
