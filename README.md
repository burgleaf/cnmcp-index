# CNMCP AI 扩展社区

按职业和任务发现、比较并安全使用 MCP、Skill 与 AI 编程工具插件。

生产站点：[https://www.cnmcp.com](https://www.cnmcp.com)

本仓库同时包含：

- 静态站点：Next.js 静态导出，发布到 Cloudflare Pages
- 内容目录：Git 中的 `resources/`、`catalog/` 与 Schema
- 匿名统计：独立的 Cloudflare Worker + D1，记录命令复制量和外链访问量
- 热度发现：独立的 Discovery Worker + D1，定期从官方 MCP Registry 与 GitHub Search 拉取候选，不写入正式 Catalog

站点不提供注册、登录、评论或站内投稿后台。推荐在[投稿页](https://www.cnmcp.com/submit/)输入源码 GitHub 仓库地址、复制提示词，交给 Cursor / Codex 通过 GitHub API 提交 Pull Request。也可以继续使用 GitHub Issue / 手写 PR。内容经维护者审核并合并到默认分支后才会进入正式 Catalog。

## 本地开发

需要 Node.js 与 Yarn 1。

```sh
yarn install
yarn dev
```

浏览器访问 `http://localhost:3000/`。

常用命令：

```sh
yarn validate:resources   # 校验资源元数据
yarn generate:catalog     # 生成 Catalog
yarn sync:github-metadata # 维护者同步 GitHub 质量数据
yarn test                 # 站点与内容测试
yarn lint
yarn typecheck
yarn build                # 校验内容并静态导出到 out/
```

统计 Worker 是独立子工程，Web 构建不依赖它在线：

```sh
yarn worker:check
yarn worker:dry-run
yarn discovery:check
yarn discovery:dry-run
```

公开环境变量见 `.env.example`。不要把 Worker secret 写进 `NEXT_PUBLIC_*`。

## 资源投稿

收录类型仅限 `mcp`、`skill`、`plugin`。`plugin` 只收录面向 AI 编程工具的平台插件；平台不作为主导航、卡片或质量排序维度。

推荐三种方式：

1. 在投稿页输入源码 GitHub 仓库地址，复制提示词，交给 Cursor、Codex 或其他能调用 GitHub 的 AI 助手。助手应读取 [`.agents/skills/submit-cnmcp-resource`](./.agents/skills/submit-cnmcp-resource)（Cursor 项目内对应 [`.cursor/skills/submit-cnmcp-resource`](./.cursor/skills/submit-cnmcp-resource)），生成 `resource.json` 并开出可审查 PR，不需要完整克隆本仓库
2. 使用仓库中的 GitHub Issue Form
3. 在 `resources/<resource-id>/` 新增 `resource.json`，按需附带安全的 `README.md` 和本地图片，再发起 Pull Request

可参考 [`examples/resource-submission/`](./examples/resource-submission/)。投稿检查清单见 Pull Request 模板。

约束：

- 目录名必须与资源 `id` 一致
- 标签来自 `catalog/tags.json`，应覆盖职业、行业、任务和能力
- 平台支持必须包含状态、核验日期，并尽量提供上游证据链接
- 详情页复制 AI 安装提示词，站点不会执行第三方命令
- 投稿者不得自行设置 `featured` 或 `sourceStats`

审核与分支保护说明见 [`docs/content-review.md`](./docs/content-review.md)。
质量评分规则见 [`docs/resource-ranking.md`](./docs/resource-ranking.md)。

## 仓库结构

```
app/            静态页面
components/     站点 UI
lib/            构建期 Catalog 与环境配置
resources/      资源条目（审核合并后才会发布）
catalog/        平台与标签注册表
schemas/        资源与平台 Schema
scripts/        校验、Catalog 生成与部署辅助脚本
worker/         独立统计 Worker
discovery/      独立发现爬虫 Worker
examples/       投稿示例
```

## 部署

Cloudflare Pages 发布静态 `out/`。统计 Worker 与 D1 负责匿名计数；发现 Worker 与独立 D1 负责热门候选索引。仓库级 Secrets、固定标识与发布顺序见 [`docs/cloudflare-deployment.md`](./docs/cloudflare-deployment.md)、[`worker/README.md`](./worker/README.md) 和 [`discovery/README.md`](./discovery/README.md)。

## 许可

Apache License 2.0，见 [LICENSE](./LICENSE)。
