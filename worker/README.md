# CNMCP Stats Worker

独立的 Cloudflare Worker + D1 匿名统计服务。根目录静态 Web 的 lint、测试和构建均不依赖本 Worker 在线。

## 本地命令

```sh
npm ci
npm run check
npm run dry-run
npx wrangler d1 migrations apply cnmcp-stats --local
```

以上命令默认只使用本地 D1。不要在未审批时添加 `--remote`、执行迁移或部署。

## Cloudflare 配置边界

`wrangler.jsonc` 仅声明普通变量和 `DB` binding。提交前必须把占位的 `database_id` 替换为目标环境真实 D1 ID；本仓库不配置真实 Cloudflare 账户。

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

Cron 每日清理过期回执和限流记录。日志仅输出 path、status、errorCode、durationMs，不包含 body、IP、User-Agent、eventId、secret 或安装命令。
