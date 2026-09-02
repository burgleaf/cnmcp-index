# AI 候选审核 M1 TDD 记录

日期：2026-09-02

## RED

提交：`e6c969f test: define ai candidate review red baseline`

失败原因符合预期：审核协议、DeepSeek 客户端、GitHub 评论适配器和候选审核工作流尚不存在；Discovery 候选 Issue 也缺少稳定候选 ID、来源与抓取时间。

## GREEN 验收范围

- DeepSeek V4 Pro 使用 OpenAI Chat Completions 请求结构和 JSON Output。
- API 失败不暴露密钥或响应正文；限流重试有次数上限。
- 模型输出经过严格 JSON Schema、证据来源和候选身份校验。
- 不可信 README 中的提示注入不会进入系统指令层。
- 规范化仓库地址的确定性重复不调用模型。
- 同一 Issue 只维护一条带固定标记的审核评论。
- 工作流只响应维护者标签/手动入口，并仅有读取内容与写 Issue 权限。
- Discovery 候选 Issue 提供稳定候选 ID、来源和抓取时间。

真实 DeepSeek API 调用不纳入 CI，避免测试产生费用和依赖外部服务；协议层以模拟响应验证。上线前需在 GitHub Actions 对一个专用候选 Issue 做人工受控验收。
