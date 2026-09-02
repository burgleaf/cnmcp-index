# PinchTab MCP

> 本页依据 [PinchTab 原仓库](https://github.com/pinchtab/pinchtab) 整理；API、安全边界和部署方式以原仓库为准。

## 它解决什么问题

PinchTab 提供本地浏览器自动化控制面、HTTP API 和 MCP Server，让 AI Agent 能操作 Chrome、提取页面内容并管理多个浏览器实例。

## 核心能力

- 启动和管理浏览器实例与标签页
- 执行导航、点击、输入和页面读取
- 通过 HTTP API 或 MCP 暴露浏览器操作
- 支持需要真实浏览器环境的研究与自动化任务

## 适合谁

适合构建网页测试、资料收集和浏览器工作流的开发者、研究者与 Agent 应用团队。

## 使用前要知道

浏览器自动化可能接触账号、Cookie 和页面隐私数据。应限制可访问站点与权限，避免在未确认前执行购买、发布或删除等外部操作。

## 接入边界

上游提供通用 MCP Server，但未在主 README 分别核验 Codex 或 Claude Code。请按原仓库的服务启动方式和客户端官方 MCP 文档配置。

## 官方资源

- [源码与 API 说明](https://github.com/pinchtab/pinchtab)

