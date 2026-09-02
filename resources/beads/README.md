# Beads MCP

> 本页依据 [Beads 原仓库](https://github.com/gastownhall/beads) 整理；命令和集成方式以原仓库为准。

## 它解决什么问题

Beads 为 AI 编程任务建立带依赖关系的工作记录，使助手在长周期开发中知道哪些任务已完成、哪些被阻塞，以及下一步应该处理什么。

## 核心能力

- 用依赖图组织任务、阻塞关系和后续工作
- 将任务状态保存在项目中，便于跨会话恢复
- 同时提供 CLI、MCP 与 AI 助手集成
- 适合把计划、实现与验收串成可追踪流程

## 适合谁

适合处理多步骤功能、维护长期技术债，或需要多位开发者和多个 AI 会话协作的工程团队。

## 使用前要知道

任务图只有持续维护才有价值。建议明确状态更新规则，并避免把敏感内容或无关对话写入项目记录。

## 上游明确提供的接入方式

上游提供 Claude Code Hooks、Settings 和 MCP 集成，并提供 `bd setup codex` 对应的 Codex Skill、AGENTS.md 指引和 Hooks。安装前请核对版本要求。

## 官方资源

- [源码与完整文档](https://github.com/gastownhall/beads)

