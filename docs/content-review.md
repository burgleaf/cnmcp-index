# PR 审核与 GitHub 保护设置

## 仓库内自动校验

所有相关 Pull Request 只运行一个工作流：`.github/workflows/pr-validation.yml` 的 `Content, Web and Worker validation`。它在 PR 合并结果上执行资源校验、Catalog 生成、Lint、类型检查、全量测试和静态构建；涉及 Worker 或 Discovery 时，再执行对应工程的检查和干运行构建。

工作流仅有 `contents: read` 权限，不读取 Cloudflare 生产凭据，也不会执行投稿资源的第三方安装命令。未合并的投稿不会进入正式 Catalog；生产部署仅从默认分支触发。

资源内容要求由 Schema、资源校验和 PR 模板共同约束：每个条目都要有 `resource.json` 与安全的 `README.md`，平台信息只能基于上游明确声明，投稿者不得修改 `featured`、`sourceStats` 或伪造审核字段。质量评分与维护者负责的数据边界见 [`resource-ranking.md`](./resource-ranking.md)。

## 必须在 GitHub 平台侧启用

仓库文件不能自行阻止合并。仓库管理员必须为默认分支 `main` 创建 Ruleset（或等价的 Branch protection rule），并启用以下最小规则：

1. 必须通过 Pull Request 合并，并禁止直接推送到 `main`。
2. 至少需要 1 个批准；新提交后撤销旧批准。
3. 要求解决所有 review conversation。
4. 将 `Content, Web and Worker validation` 设为 required status check。
5. 不允许绕过未通过的 required checks；管理员绕过权限应按仓库治理策略单独决定。

如果维护者名单固定，可额外配置 `.github/CODEOWNERS` 并在 Ruleset 中要求 Code Owner 批准；否则，一个具备合并权限的维护者批准即可。生产部署工作流继续只允许默认分支触发，并使用仓库级 Actions secrets。
