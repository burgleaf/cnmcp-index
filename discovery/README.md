# CNMCP Discovery Worker

独立的 Cloudflare Worker + D1 发现服务：定时从官方 MCP Registry 与 GitHub Search API 拉取热门 MCP / Skill / 插件候选，供静态站「发现」页读取，并把高分未收录项开成 GitHub Issue。

根目录静态 Web 的 lint、测试和构建均不依赖本 Worker 在线。本服务**不会**写入 `resources/` 或正式 Catalog。

## 本地命令

```sh
npm ci
npm run check
npm run dry-run
npx wrangler d1 execute DB --local --file=migrations/0001_discovery.sql
npx wrangler d1 execute DB --local --file=migrations/0002_promotions.sql
```

手动触发定时入口（需 `wrangler dev`）：

```sh
curl "http://localhost:8787/__scheduled?cron=0+16+*+*+*"
```

不要在未审批时添加 `--remote`、执行远程迁移或部署。

## Cloudflare 配置边界

`wrangler.jsonc` 仅声明普通变量、`DB` 与 Workflow binding。提交前必须把占位的 `database_id`（`00000000-0000-4000-8000-000000000001`）替换为目标环境真实 D1 ID。GitHub 只需要仓库级 Secrets `CLOUDFLARE_API_TOKEN` 和 `CLOUDFLARE_ACCOUNT_ID`，详见 [`docs/cloudflare-deployment.md`](../docs/cloudflare-deployment.md)。

`GITHUB_TOKEN` **只通过 Wrangler secret 配置**，不得写入 `wrangler.jsonc`、`.env`、前端变量、日志或 D1：

```sh
npx wrangler secret put GITHUB_TOKEN
```

Token 需要：公开仓库只读，以及本仓库 `issues:write`（用于创建 `[自动发现]` Issue）。

普通变量：

- `ALLOWED_ORIGINS`：逗号分隔、完整 Origin；生产默认仅 `https://www.cnmcp.com`。
- `CATALOG_REPOSITORY`：用于开 Issue 的 `owner/repo`。
- `CATALOG_JSON_URL`：站点已发布的 `catalog.json`，一次拉取做已收录匹配。
- `PROMOTION_MIN_STARS`：自动开 Issue 的最低 star 数。
- `PROMOTION_MAX_ISSUES_PER_CRAWL`：每次爬取最多开 Issue 数。
- `SOURCE_KIND_LIMIT`：每个来源的抓取上限（只进入内存，不直接等于 D1 行数）。
- `PERSIST_PER_KIND_LIMIT`：mcp / skill / plugin 各自写入 D1 的上限。
- `SEARCH_PAGES_PER_QUERY`：每个 GitHub Search 查询最多翻页数（1–2）。

需要 Cloudflare **Workers Paid**：Cron 与 Workflow 的 CPU / 墙钟时间 Free 档不够。

Cron 每日 16:00 UTC（北京时间 00:00）启动幂等 Workflow（instance id=`crawl-YYYY-MM-DD`，按 UTC 日期）。同日实例若已失败，会用 `crawl-YYYY-MM-DD-retry-<timestamp>` 重跑。Workflow 拆成 ingest / persist / promote 三步。日志仅输出 path、status、errorCode、durationMs，不包含 token、Issue 正文或安装命令。D1 的 `candidates` 只保存当前快照（三类 kind、按 kind 截断）；`promotions` 单独保存已开 Issue / 已收录状态，避免快照淘汰后重复开 Issue。
