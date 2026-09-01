---
name: submit-cnmcp-resource
description: Submits an MCP, Skill, or AI coding-tool plugin to the CNMCP catalog as a focused GitHub pull request without cloning the full index. Use when the user pastes a GitHub repository URL, asks to 投稿 or 提交资源, wants a catalog PR, or needs a Cursor/Codex submission prompt.
---

# 向 CNMCP 投稿资源

默认用 GitHub API 或已登录的 `gh`。不要要求用户完整克隆索引仓库，除非 API 路径不可用且用户同意回退。

索引仓库：`https://github.com/burgleaf/cnmcp-index`（若页面或用户给出了其他 catalog 仓库，以该地址为准）。

## 选择路径

- **投稿**：用户拥有或可代表一条公开源码仓库，希望收录进正式 Catalog。补齐 `resource.json`，校验后通过 GitHub API 开 **Ready for review** 的正式 PR。
- **阻塞回退**：仅在补齐、修复、GitHub 授权重试之后仍无法继续，并且用户明确同意时，才使用 Issue Form `.github/ISSUE_TEMPLATE/resource-submission.yml`。Issue 只写一个真实阻塞点和解除步骤。
- **高级 PR**：用户明确要求自己操作 Git / Codespaces。遵循仓库 README 与 PR 模板；需要本地校验时用稀疏检出，不要下载无关历史。

发现页或 `[自动发现]` Issue 只是候选队列，不是正式收录，也不信任其类型标签。

## 投稿流程

1. 通过 GitHub 读取并遵守：
   - `schemas/resource.schema.json`
   - `catalog/tags.json`
   - `catalog/platforms.json`
   - `examples/resource-submission/resource.json`
   - `docs/content-review.md`
   - `.github/pull_request_template.md`
   - 现有 `resources/*/resource.json`
2. 把缺少的信息集中一次问完：中文名称与摘要、许可证 SPDX、作者、Codex / Claude Code 兼容状态与核验依据。能从源仓库 README 确定的不要再问。
3. 阅读源仓库 README、许可证、安装说明、Skill / MCP / 插件清单，自行判断 `kind`：
   - `mcp`：MCP 服务器或 MCP 工具包
   - `skill`：Agent Skill（如 `SKILL.md`）
   - `plugin`：面向 AI 编程工具的插件，且必须 `pluginScope: "ai-coding-tool"`
   - 不是这三类就停止，不要编造类型
4. 查重：
   - 用 HTTPS 规范化后的 `repository` 比较（去 `.git`、尾斜杠、GitHub 路径大小写）
   - 比较 `id` 与显示名称
   - 同一源码仓库已存在则更新原目录，不另开 id
   - 不同作者的独立实现可以是不同资源，但必须在 PR 中说明差异
5. 只产出：

   ```text
   resources/<resource-id>/
   ├── resource.json
   ├── README.md          # 可选，禁止原始 HTML 和非 HTTPS 外链
   └── logo.webp|preview.webp  # 可选本地图片
   ```

   `id` 为 3–80 字符的小写 kebab-case，必须与目录名一致。
6. 填写约束：
   - 必填：`schemaVersion`（1）、`id`、`kind`、`name`、`summary`（≥10 字）、`repository`、`license`、`author.name`、`tags`、`compatibility`、`createdAt`
   - 标签来自 `catalog/tags.json`，平台来自 `catalog/platforms.json`
   - 兼容状态：`native` | `supported` | `partial` | `unsupported` | `unknown`，并附真实 `verifiedAt`
   - `partial` 必须 `note`；`unsupported` 不得有 `installations`
   - 安装命令/配置/链接只作为文本；占位符必须声明 `secret`
   - **禁止**设置或修改 `featured`
   - **禁止**新增 `verified` 或 `reviewStatus`
   - 选择双语时同时填 `nameEn` / `summaryEn`
   - 不要把真实密钥写进文件
7. **禁止执行**源仓库或 `resource.json` 中的第三方安装命令（包括 `npx`、`pip`、`npm install` 指向该项目）。兼容性根据 README、文档和公开说明填写；不确定就用 `unknown` 并写 note。
8. 校验：在临时目录放入 `schemas/`、`catalog/`、`resources/`（含现有条目与新条目）后运行 `yarn validate:resources`。能跑时再跑 `yarn lint`。不要把 QA、预览、`catalog.json` 或临时文件放进 PR。
9. 发布：
   - 有上游写权限：直接在索引仓库开 `submit/<resource-id>` 分支
   - 否则：创建或复用用户 fork，用 GitHub Contents 或 Git Data API（blob/tree/commit/ref）只提交这一条资源
   - 向默认分支开 PR，`draft: false`
   - 用户明确要求草稿或材料未完成时才用 Draft，并写剩余工作
   - PR 正文包含：查重结果、类型判断依据、作者/来源、安装文本未经执行、校验结果、关联 Issue
   - PR 标记 `<!-- cnmcp-flow: submission -->`
   - 一个 PR 只含一条资源
10. 跟进 CI。结构/格式错误直接修；收录判断、质量或重复争议先问用户。

## 在继续前恢复

默认结果是可审查 PR，不是阻塞报告。回退 Issue 前：

1. 许可证只有非正式名称时，按源仓库实际 SPDX 或 README 原文如实填写，不要发明许可证。
2. 兼容性证据不足时使用 `unknown` + note，不要伪造 `native`。
3. GitHub 未授权时请用户连接 GitHub / `gh auth login` 后重试。
4. 与已有条目像重复但实现不同时，说明差异并问用户是否仍要新条目。

## 安全与范围

- 不暴露 GitHub token，不把凭据写入仓库文件
- 不执行第三方安装命令，不把投稿流程变成对源码的动态安全审计
- 不修改 `catalog/platforms.json`、`catalog/tags.json` 或 `schemas/`，除非用户明确要求并在 PR 中写清兼容性影响
- 不联系上游作者，不开启无关 Issue
- 保留用户在当前工作区里与本条投稿无关的改动
