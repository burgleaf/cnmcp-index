# 资源投稿目录示例

复制此目录的结构到 `resources/<resource-id>/`，并将 `resource.json` 中的占位内容替换为真实信息。可按需增加安全的 `README.md`、`logo.webp` 或 `preview.webp`。

用 Cursor / Codex 投稿时，读取 [`.agents/skills/submit-cnmcp-resource`](../../.agents/skills/submit-cnmcp-resource) 并通过 GitHub API 开 PR，不必完整克隆索引仓库。

- `id` 必须为小写 kebab-case，并与目录名一致。
- `kind` 只能是 `mcp`、`skill` 或 `plugin`；`plugin` 还必须设置 `pluginScope: "ai-coding-tool"`。
- 标签必须来自 `catalog/tags.json`，平台必须来自 `catalog/platforms.json`。
- 兼容性必须包含状态和真实核验日期；`partial` 必须说明限制，`unsupported` 不得提供安装入口。
- 安装命令和配置仅作为待审核文本提交，站点不会执行它们。不得提交真实密钥。
- 投稿者不得设置 `featured`，也不得新增 Schema 不存在的 `verified` 或 `reviewStatus`。精选状态由维护者审核控制。
