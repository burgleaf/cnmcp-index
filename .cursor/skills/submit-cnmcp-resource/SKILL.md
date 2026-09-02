---
name: submit-cnmcp-resource
description: Submits an MCP, Skill, or AI coding-tool plugin to the CNMCP catalog as a focused GitHub pull request without cloning the full index. Use when the user pastes a GitHub repository URL, asks to 投稿 or 提交资源, wants a catalog PR, or needs a Cursor/Codex submission prompt.
---

# 向 CNMCP 投稿资源

读取并严格执行仓库内的规范 Skill：

[`.agents/skills/submit-cnmcp-resource/SKILL.md`](../../../.agents/skills/submit-cnmcp-resource/SKILL.md)

若不在本仓库工作区，改为读取：

`https://raw.githubusercontent.com/burgleaf/cnmcp-index/HEAD/.agents/skills/submit-cnmcp-resource/SKILL.md`

硬约束（与规范 Skill 相同，读完整文件前也必须遵守）：

- 用 GitHub API 开 **Ready for review** 的正式 PR，不要默认 Draft
- 不要完整克隆索引仓库
- 只写 `resources/<id>/`，必须包含 `resource.json` 和面向详情页的 `README.md`
- 类型仅限 `mcp` / `skill` / `plugin`；plugin 必须 `pluginScope: "ai-coding-tool"`
- 不得设置 `featured`，不得新增 `verified` 或 `reviewStatus`
- 不得执行第三方安装命令
- 平台信息只摘录上游明确说明；未声明时使用 `unknown`，不推断支持关系
- 一个 PR 只包含一条资源
- GitHub 未授权时先请用户连接后重试
