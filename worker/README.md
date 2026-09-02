# CNMCP Stats Worker

独立的 Cloudflare Worker + D1 匿名统计与任务缺口服务。根目录静态 Web 的 lint、测试和构建均不依赖本 Worker 在线。

服务提供两类写入：

- `/v1/events`：记录已收录资源的安装内容复制和上游访问。
- `/v1/search-events`：记录经过清洗的搜索任务、结果数量和筛选条件，聚合为稳定的 `gapId`。

搜索框停顿 800ms 后才尝试上报；统计失败不会影响静态目录。客户端和 Worker 都会规范化查询、隐藏邮箱与 URL，并拒绝疑似 API Key 或 Bearer Token。D1 不保存原 IP、User-Agent 或原始 eventId；来源 IP 只与 `HASH_SALT` 一起用于小时限流哈希。

## 本地命令

```sh
npm ci
npm run check
npm run dry-run
npx wrangler d1 migrations apply cnmcp-stats --local
```

以上命令默认只使用本地 D1。不要在未审批时添加 `--remote`、执行迁移或部署。

## Cloudflare 配置边界

`wrangler.jsonc` 仅声明普通变量和 `DB` binding。提交前必须把占位的 `database_id` 替换为目标环境真实 D1 ID。GitHub 只需要仓库级 Secrets `CLOUDFLARE_API_TOKEN` 和 `CLOUDFLARE_ACCOUNT_ID`，详见 [`docs/cloudflare-deployment.md`](../docs/cloudflare-deployment.md)。

`HASH_SALT` **只通过 Wrangler secret 配置**，不得写入 `wrangler.jsonc`、`.env`、前端变量、日志或 D1：

```sh
# 值格式：base64url:<至少 32 个 CSPRNG 随机字节的 base64url 编码>
# 示例生成命令只输出待人工保存的值，不会写文件：
node -e "console.log('base64url:'+require('crypto').randomBytes(32).toString('base64url'))"
npx wrangler secret put HASH_SALT
```

运行时会解码 base64url，并要求解码结果至少 32 字节。字节长度是可验证下限；实际熵由使用系统 CSPRNG 生成来保证。

普通变量：

- `ALLOWED_ORIGINS`：逗号分隔、完整 Origin；生产默认仅 `https://www.cnmcp.com`。
- `EVENT_RATE_LIMIT_PER_HOUR`：每个来源每小时事件上限。
- `RECEIPT_RETENTION_SECONDS`：幂等回执保留秒数，默认 8 天。
- `RATE_LIMIT_RETENTION_SECONDS`：限流桶保留秒数，默认 2 小时。
- `TASK_QUERY_RETENTION_SECONDS`：搜索回执和未升级缺口的最长保留窗口，默认 30 天。
- `GAP_QUALIFY_MIN_SEARCHES`：缺口自动进入 `qualified` 的最少搜索次数，默认 3。
- `GAP_QUALIFY_MIN_SCORE`：缺口自动进入 `qualified` 的最低优先级分，默认 50。

优先级由需求量、零结果比例、低结果比例和当前资源稀缺度共同计算。Cron 每日执行以下工作：

1. 清理过期资源事件回执、搜索回执和限流记录。
2. 删除超过保留窗口且仍处于 `observed` 的搜索缺口及其台账。
3. 刷新缺口分数，达到阈值时将其升级为 `qualified`，并写入一次性状态台账。

生产发布必须依次应用 `0001_initial_stats.sql` 和 `0002_task_gaps.sql`。日志仅输出 path、status、errorCode、durationMs，不包含 body、查询词、IP、User-Agent、eventId、secret 或安装命令。
