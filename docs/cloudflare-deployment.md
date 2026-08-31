# Cloudflare 部署前置条件

GitHub Actions 只定义流程。仓库不保存 Cloudflare API Token，也不自动创建生产资源。站点 URL、Worker 入口、Pages 项目名写死在工作流里；D1 ID 写在 `worker/wrangler.jsonc`。

## 固定标识

| 项目 | 值 |
| --- | --- |
| GitHub 仓库 | `https://github.com/burgleaf/cnmcp-index` |
| Pages 主站 | `https://www.cnmcp.com` |
| Pages 项目 | `cnmcp-index` |
| Worker 名称 | `cnmcp-stats-api` |
| Worker 入口 | `https://api.cnmcp.com` |
| D1 数据库名 | `cnmcp-stats` |

## 一次性创建 Cloudflare 资源

在 `worker/` 创建 D1，并把输出中的数据库 ID 写进 `worker/wrangler.jsonc` 的 `database_id`（替换 `REPLACE_WITH_D1_DATABASE_ID`）：

```sh
cd worker
npm ci
npx wrangler login
npx wrangler d1 create cnmcp-stats
```

未填入真实 ID 前，远程 migration、Catalog 同步和 Worker/Pages 部署都应视为不可执行。

首次发布前，为 `cnmcp-stats-api` 预配置 `HASH_SALT`（至少 32 字节熵）。工作流只调用 `wrangler secret list --format json` 检查名称存在，不读取或输出值。不要把它配成 GitHub Secret、Variable 或 `NEXT_PUBLIC_*`：

```sh
npx wrangler secret put HASH_SALT
```

## GitHub Secrets

在仓库 **Settings → Secrets and variables → Actions** 添加，不要再建 `production-worker` / `production-pages` Environment：

| Secret | 必需 | 说明 |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | 是 | 最小权限 token；只授权目标账户的 D1 与对应 Worker/Pages 项目。 |
| `CLOUDFLARE_ACCOUNT_ID` | 是 | 32 位账户 ID。 |

可选仓库 Variable（不是 Secret）：

| Variable | 必需 | 说明 |
| --- | --- | --- |
| `CLOUDFLARE_WEB_ANALYTICS_TOKEN` | 否 | 公开 Web Analytics site token，会进入静态 HTML。未配置时站点不加载 Analytics beacon。不得填写 API Token。 |

Pull Request 工作流只有 `contents: read`，不会引用这些凭据。

## 失败与发布顺序

Worker 工作流固定执行：本地检查与 dry-run → 检查仓库级凭据与已提交的 D1 ID → remote D1 migrations → remote Catalog sync → Worker deploy → 协议烟测。任一步非零退出都会阻止后续步骤。

Pages 工作流固定执行：内容校验/生成 → 同提交 Worker 成功门（仅 Worker 生产依赖路径变化时）→ remote Catalog sync → 静态构建 → 候选 Pages deployment → 完整静态路由烟测 → 将同一 `out/` 发布到生产分支。候选烟测或最终生产上传失败时，原生产 deployment 保持不变；生产上传由 Pages 原子创建新 deployment。

工作流中的所有 Wrangler 命令来自 `worker/package-lock.json` 锁定的 `wrangler@4.127.1`。远程步骤只会在默认分支 push，或 GitHub Actions 页面对 `Deploy Worker Production` / `Deploy Pages Production` 的手动 `workflow_dispatch` 中执行。手动发布 Pages 时不要求同一提交的 Worker 工作流已成功。
