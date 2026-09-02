# Claude HUD

> 本页依据 [Claude HUD 原仓库](https://github.com/jarrodwatts/claude-hud) 整理；界面和兼容版本以原仓库为准。

## 它解决什么问题

Claude HUD 在 Claude Code 工作区持续显示上下文占用、工具活动、子智能体和待办进度，让用户不用反复询问当前状态，也能判断会话是否接近上下文上限。

## 核心能力

- 展示上下文窗口使用情况
- 汇总正在运行或近期使用的工具与子智能体
- 显示待办事项和任务进度
- 使用 Claude Code 原生 statusline API 呈现状态

## 适合谁

适合频繁运行长会话、并行子任务或工具调用，希望及时掌握执行状态的 Claude Code 用户。

## 使用前要知道

该项目依赖 Claude Code 的 statusline 能力，不应把界面状态当成任务完成证明；仍需以实际文件、测试和命令结果验收。

## 上游明确提供的接入方式

上游将其定义为 Claude Code 插件并给出原生安装方式；没有提供其他 AI 编程平台的明确兼容承诺。

## 官方资源

- [源码与安装说明](https://github.com/jarrodwatts/claude-hud)

