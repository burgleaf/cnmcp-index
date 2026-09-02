# Graphiti MCP

> 本页依据 [Graphiti 原仓库](https://github.com/getzep/graphiti) 整理；部署、模型和数据库要求以原仓库为准。

## 它解决什么问题

Graphiti 为 AI Agent 构建会随时间更新的知识图谱，将实体、关系和事件组织为可查询记忆，并通过独立 MCP Server 暴露相关操作。

## 核心能力

- 从持续到来的信息中提取实体和关系
- 保留关系的时间变化与历史上下文
- 查询节点、边和与当前任务相关的记忆
- 通过 MCP Server 接入支持该协议的 Agent

## 适合谁

适合构建长期记忆、客户或研究知识图谱，以及需要处理事实随时间变化的 Agent 应用开发者。

## 使用前要知道

该资源通常涉及模型服务、数据库和环境变量，部署成本高于单文件 Skill。写入敏感数据前应设计访问控制、保留期限与删除机制。

## 接入边界

上游提供通用 MCP Server，但主 README 未分别核验 Codex 或 Claude Code 的客户端配置。请根据原仓库列出的服务命令和所用客户端的 MCP 文档手动接入。

## 官方资源

- [源码与部署说明](https://github.com/getzep/graphiti)

