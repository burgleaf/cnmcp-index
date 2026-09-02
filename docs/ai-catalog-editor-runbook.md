# AI 候选审核助理运行手册

## 当前能力

当维护者给自动发现候选 Issue 添加 `ai-review` 标签，或手动运行 `AI Candidate Review` 工作流时，系统会：

1. 解析并规范化候选 GitHub 仓库地址。
2. 读取 GitHub 仓库元数据、README 和许可证，且限制来源、内容长度、跳转和请求范围。
3. 在调用模型前按 Catalog 仓库地址进行确定性查重。
4. 使用 DeepSeek V4 Pro 的 OpenAI Chat Completions 格式生成 JSON 审核报告。
5. 校验报告 Schema、候选身份、事实来源和兼容性证据。
6. 创建或更新同一条 Issue 评论；不会创建 PR、运行上游代码或修改 Catalog。

同一候选、同一上游 `pushedAt`、同一模型及同一协议版本会生成相同指纹。已有该指纹时默认跳过模型调用；手动运行时可通过 `force` 要求重新审核。

## GitHub 配置

仓库需要配置一个 Actions Secret：

- `DEEPSEEK_API_KEY`：DeepSeek API 密钥。

工作流内固定以下非敏感配置：

- `DEEPSEEK_BASE_URL=https://api.deepseek.com`
- `DEEPSEEK_MODEL=deepseek-v4-pro`
- 单次最长 60 秒、最多 3 次尝试、最多 3000 输出 token。

如需降低成本，可把工作流中的模型切换为 `deepseek-v4-flash`。应用层只接受官方 V4 文本模型标识和官方 HTTPS Base URL。

## 人工操作

自动入口：在候选 Issue 添加 `ai-review` 标签。

手动入口：在 GitHub Actions 中选择 `AI Candidate Review`，填写 Issue 编号；只有明确需要忽略已有指纹时才启用 `force`。

报告的三个建议动作均不产生自动发布行为：

- `draft_pr`：资料基本满足下一阶段要求，维护者仍需确认。
- `needs_human`：存在证据缺失或需要人工判断的问题。
- `do_not_list`：重复、超出范围或有明确阻断项。

## 安全边界

- Issue 和上游 README/许可证全部视为不可信数据。
- 只访问 `api.github.com` 的固定 REST 路径和 `api.deepseek.com/chat/completions`。
- 不克隆候选仓库，不执行命令、安装脚本或仓库代码。
- GitHub Actions 权限只有 `contents: read` 与 `issues: write`。
- PR 校验工作流无法读取 DeepSeek Secret。
- AI 声称的兼容性只有在同一候选 GitHub 仓库存在明确证据时才可通过校验。
- 错误和运行日志只记录状态、候选 ID、模型、耗时和 token，不记录密钥或完整上游内容。

## 失败处理

超时、限流、非法 JSON、Schema 错误或身份不一致都会令任务失败，并且不会写入半成品评论。先查看 Actions 的结构化错误类型；不要把密钥、完整提示或未清洗的上游内容复制到公开 Issue。

DeepSeek 的接口依据：[Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/)、[JSON Output](https://api-docs.deepseek.com/zh-cn/guides/json_mode/) 和 [模型与价格](https://api-docs.deepseek.com/quick_start/pricing/)。
