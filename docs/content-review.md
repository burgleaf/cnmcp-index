# 内容审核与 GitHub 保护设置

## 仓库内已实现边界

`.github/workflows/content-review.yml` 对以下路径执行等价于 CODEOWNERS 的动态维护者审核门禁：

- `resources/**`
- `catalog/platforms.json`
- `catalog/tags.json`
- `schemas/**`

检查只从受信任的 PR 基准分支检出审核脚本，不运行投稿分支中的代码或安装命令。只接受对**当前 PR 提交**的批准，批准者必须由 GitHub API 确认为仓库具有 `write`、`maintain` 或 `admin` 权限。脚本还会读取基准与投稿版本的 `resource.json`，在日志和 Job Summary 中明确列出每一项 `featured: false → true` 或 `true → false` 变化。

未合并的投稿只存在于 PR 分支。正式 Catalog 的生成和生产发布必须只使用默认分支；PR 工作流不得获得 Cloudflare Pages、D1 或 Worker 的生产写权限。`featured` 仅在维护者审核合并后才能影响首页精选。

## 必须在 GitHub 平台侧启用

仓库文件无法自行强制分支规则。管理员必须在默认分支的 Ruleset 或 Branch protection rule 中完成以下设置：

1. 启用“Require a pull request before merging”。
2. 将 `Content Maintainer Review / Protected Content Review` 设为 required status check。
3. 启用新提交后撤销旧批准（dismiss stale approvals），并禁止未通过 required checks 的绕过；是否允许管理员绕过应由仓库治理策略明确决定。
4. 将后续内容校验/静态构建工作流也设为 required status checks。
5. 生产部署工作流只允许默认分支触发。Cloudflare 凭据使用仓库级 Actions secrets（`CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`），不经过 Pull Request 工作流。

即使将来增加 `.github/CODEOWNERS`，CODEOWNERS 文件本身也不能强制审核；仍需在平台侧启用“Require review from Code Owners”和默认分支保护。当前仓库未配置可验证的 Git remote/维护者账号，因此没有猜测不存在的用户名或团队，而使用仓库权限动态判定维护者。
