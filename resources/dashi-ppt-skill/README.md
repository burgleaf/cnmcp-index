# 大师 PPT Skill

源码：[chuspeeism/dashi-ppt-skill](https://github.com/chuspeeism/dashi-ppt-skill)

把文档交给 AI Agent，生成带编辑控制台的网页演示文稿：可在浏览器里改文字、换图片、调版式，再导出 HTML、PDF 或可编辑 PPTX。

## 能力

- 12 套视觉主题，覆盖封面、目录、指标、对比、流程、风险、结尾等页面角色
- 生成结果即编辑器：点击改字、拖拽换图、滑杆调整模块数量和页面重点
- 支持图表与分析模型版式，如雷达图、瀑布图、SWOT、波特五力、商业模式画布
- 导出 HTML 离线包、PDF，以及尽量保持可编辑的 PPTX

## 安装

需要 Node.js 20+ 和 npm。导出 PPTX / PDF 需要本机 Chrome、Chromium 或 Edge。

```bash
npx dashi-ppt-skill@latest
```

国内网络：

```bash
npx --registry=https://registry.npmmirror.com dashi-ppt-skill@latest
```

安装和更新是同一条命令。也可让 Agent 执行上述命令完成安装。

## 使用

1. 说明主题、受众、页数和要突出的结论
2. 从 12 套风格里选一套，并确认是否需要配图
3. 等 Agent 组稿后，在浏览器里改文字、换图、调版式
4. 导出需要的格式

## 许可

仓库主体为 AGPL-3.0。上游说明导出引擎 `project/packages/html-deck-to-pptx` 为专有组件，仅授权作为该 Skill 的组成部分使用。详情见源码仓库 LICENSE。
