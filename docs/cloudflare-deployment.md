# Cloudflare 部署前置条件

任务 8 的 GitHub Actions 只定义流程；仓库内不保存真实 Cloudflare ID、API Token、Worker secret，也不自动配置生产资源。

## GitHub Environments

创建两个受保护 environment，并按团队发布策略配置必需审批人：

- `production-worker`：Worker、D1 migration 与 Catalog 同步。
- `production-pages`：D1 Catalog 同步与 Cloudflare Pages 发布。

两个 environment 都应限制为默认分支。Pull Request 工作流只具有 `contents: read`，不会引用这些 environment 或 Cloudflare 配置。

## Environment secrets 与 variables

两个 environment 均配置：

- Secret `CLOUDFLARE_API_TOKEN`：使用最小权限 token；只授权目标账户的 D1 与对应 Worker/Pages 项目。
- Variable `CLOUDFLARE_ACCOUNT_ID`：32 位账户 ID。
- Variable `CLOUDFLARE_D1_DATABASE_ID`：目标 D1 database ID。
- Variable `PRODUCTION_SITE_URL`：生产站点 HTTPS Origin，例如 `https://www.cnmcp.com`。
- Variable `WORKER_API_URL`：统计 Worker HTTPS Origin，例如 `https://api.cnmcp.com`。

`production-pages` 另外配置：

- `CLOUDFLARE_PAGES_PROJECT`：Pages 项目名称。
- 可选 `GITHUB_REPOSITORY_URL`：公开投稿仓库 URL。
- 可选 `CLOUDFLARE_WEB_ANALYTICS_TOKEN`：公开 Web Analytics site token。它会进入静态 HTML，不得填写 Cloudflare API Token 或其他 secret；未配置时站点不加载 Analytics beacon。

## Cloudflare Worker secret

首次生产发布前，通过受控的 Cloudflare 管理流程为 `cnmcp-stats-api` 预配置 `HASH_SALT`。该值必须满足 Worker 的至少 32 字节熵要求。工作流只调用 `wrangler secret list --format json` 检查名称存在，不读取或输出值；`HASH_SALT` 不应配置为 GitHub secret、普通 variable 或 `NEXT_PUBLIC_*`。

## 失败与发布顺序

Worker 工作流固定执行：本地检查与 dry-run → 检查生产前置条件 → remote D1 migrations → remote Catalog sync → Worker deploy → 协议烟测。任一步非零退出都会阻止后续步骤。

Pages 工作流固定执行：内容校验/生成 → 同提交 Worker 成功门（仅 Worker 生产依赖路径变化时）→ remote Catalog sync → 静态构建 → 候选 Pages deployment → 完整静态路由烟测 → 将同一 `out/` 发布到生产分支。候选烟测或最终生产上传失败时，原生产 deployment 保持不变；生产上传由 Pages 原子创建新 deployment。

工作流中的所有 Wrangler 命令来自 `worker/package-lock.json` 锁定的 `wrangler@4.127.1`。仓库当前不会自动执行任何远程命令；远程步骤只会在默认分支事件或受保护 environment 批准后的手动 Worker 运行中执行。
