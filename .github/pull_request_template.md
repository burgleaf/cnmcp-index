## 变更说明

<!-- 说明新增或修改了哪个资源，以及信息来源。 -->

## 资源投稿检查

- [ ] 资源位于 `resources/<resource-id>/`，目录名与 `resource.json` 的 `id` 一致。
- [ ] 字段符合 `schemas/resource.schema.json`，标签和平台来自对应注册表。
- [ ] 已提供公开 HTTPS 源码地址、许可证、作者，以及职业/任务导向标签。
- [ ] 平台支持只依据上游声明，包含核验日期并尽量提供 `evidenceUrl`。
- [ ] 详情页由站点生成 AI 安装提示词，第三方命令不会由站点或审核流程自动执行。
- [ ] 本次投稿没有设置或修改 `featured`、`sourceStats`，也没有新增 `verified` 或 `reviewStatus`；精选和质量快照由维护者决定。
- [ ] 我理解 PR 在维护者批准并合并到默认分支前不会进入正式 Catalog。

可参考 `examples/resource-submission/resource.json`。若修改 `catalog/platforms.json`、`catalog/tags.json` 或 `schemas/`，请在说明中给出兼容性和迁移影响。
