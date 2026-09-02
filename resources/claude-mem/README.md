# Claude Mem

> 本页依据 [Claude Mem 原仓库](https://github.com/thedotmack/claude-mem) 与 [官方文档](https://docs.claude-mem.ai/) 整理。

## 它解决什么问题

Claude Mem 自动捕获并压缩 AI 编程会话，把相关历史上下文带到后续任务中，降低重复描述需求、架构和调试经过的成本。

## 核心能力

- 通过 Hooks 捕获会话活动并生成压缩记忆
- 在新会话中注入与当前任务相关的历史信息
- 提供本地记忆检索界面与 MCP 搜索工具
- 支持按项目沉淀长期知识

## 适合谁

适合长期维护复杂项目、需要频繁切换会话，或希望检索过去实现与决策的个人开发者和团队。

## 使用前要知道

启用自动捕获前应检查隐私、存储位置和排除规则。记忆可能过期或缺失上下文，关键结论仍应回到代码与文档核验。

## 上游明确提供的接入方式

上游以 Claude Code 插件作为主要入口，同时在官方文档中列出 Codex 等 Agent 和通用 MCP 能力。请根据当前版本选择上游推荐方式。

## 官方资源

- [源码仓库](https://github.com/thedotmack/claude-mem)
- [完整文档](https://docs.claude-mem.ai/)

