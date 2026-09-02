# Context Hub

> 本页依据 [Context Hub 原仓库](https://github.com/andrewyng/context-hub) 整理；可用文档源和 CLI 行为以原仓库为准。

## 它解决什么问题

Context Hub 帮助 AI 编程助手获取版本化 API 文档，并允许团队在本地附加注释，减少模型使用过期接口或遗漏项目约定的情况。

## 核心能力

- 通过 Chub CLI 查询 API 文档
- 为文档添加本地、项目相关的补充说明
- 用 Agent Skill 指导助手在需要时获取正确上下文
- 支持研究与开发过程中复用已整理资料

## 适合谁

适合依赖多个第三方 API、需要固定版本文档，或希望把团队经验叠加到公共文档上的开发者和研究者。

## 使用前要知道

检索结果仍可能落后于服务端变化。涉及计费、权限或破坏性 API 时，应再次核对服务商官方文档。

## 上游明确提供的接入方式

上游提供 `get-api-docs/SKILL.md` 并明确说明 Claude Code 的 Skill 安装目录；Chub CLI 可独立使用，但其他平台未被上游单独核验。

## 官方资源

- [源码与 CLI 说明](https://github.com/andrewyng/context-hub)

