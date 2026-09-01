# ECC 智能体工程系统

> 本说明为目录详情页准备的中文摘要。完整且最新的内容以 [ECC 上游 README](https://github.com/affaan-m/ECC#readme) 为准。

## 它是什么

ECC 是面向 AI 编程助手的智能体工程系统。它将规划、测试、实现、审查、验证、记忆与持续改进组织为可复用的工程工作流，帮助编码智能体更稳定地完成复杂开发任务。

## 核心能力

- **68 个专业智能体**：覆盖规划、构建修复、代码审查、安全、架构和垂直领域任务。
- **286 个 Skill**：提供测试驱动开发、研究、安全、文档、前端、数据和运维等工作流。
- **Hooks、规则与记忆**：用于执行约束、上下文管理和持续学习。
- **AgentShield**：扫描提示词、Hooks、MCP 配置、权限、密钥和智能体文件中的风险。

## 快速开始

每个编码平台只选择一种安装方式，避免在同一平台重复安装而产生重复的 Skill、命令或 Hooks。

### Codex

```bash
codex plugin marketplace add affaan-m/ECC
codex plugin add ecc@ecc
```

### Claude Code

在 Claude Code 中运行：

```text
/plugin marketplace add https://github.com/affaan-m/ECC
/plugin install ecc@ecc
```

也可以通过通用引导安装程序配置 Claude Code、Codex 或 Kimi Code：

```bash
npx ecc-universal install --guided
```

## 资源入口

- [源码仓库](https://github.com/affaan-m/ECC)：查看完整代码、版本和问题反馈。
- [官方站点](https://ecc.tools)：查看产品与社区信息。
- [完整使用文档](https://github.com/affaan-m/ECC#readme)：查看各平台的安装、兼容性与进阶配置。

## 使用提示

- 优先使用上方的原生插件安装路径或引导安装路径之一，不要在同一平台叠加多种安装方式。
- 不同编辑器和智能体平台的能力覆盖范围可能不同；安装前请查看上游的兼容性说明。
- 仅从上方列出的官方渠道获取安装包、插件和配置。
