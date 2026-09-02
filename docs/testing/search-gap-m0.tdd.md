# 搜索缺口 M0 TDD 证据

日期：2026-09-02  
分支：`codex/ai-search-gap-m0`  
来源计划：[`../ai-catalog-editor-development-plan.md`](../ai-catalog-editor-development-plan.md)

## 用户旅程

1. 作为目录访客，我在资源页输入任务后，希望站点在不影响搜索体验的前提下匿名记录当前结果数量。
2. 作为维护者，我希望相同任务被聚合为稳定缺口，以便发现零结果和低结果需求。
3. 作为维护者，我希望系统按可解释阈值每天刷新优先级，并只记录一次状态升级。
4. 作为隐私敏感用户，我希望邮箱、URL、IP、User-Agent、原 eventId 和疑似密钥不会进入长期统计记录。
5. 作为发布维护者，我希望生产工作流在 Worker 部署前应用完整 D1 Schema。

## 任务与验证报告

| 计划任务 | 实现摘要 | RED 证据 | GREEN 证据 | 保证 |
|---|---|---|---|---|
| LOOP-101 | 搜索停顿 800ms 后发送清洗任务、结果数和筛选条件；失败静默降级 | 根目录 Jest 报告缺少 `search-gap-client`，组件未发送事件 | `yarn jest lib/search-gap-client.test.ts components/resource-directory-client.test.tsx --runInBand`：18 项通过 | 搜索与统计解耦，敏感密钥不上报，响应严格校验 |
| LOOP-201 | 新增 `task_gaps`、`search_event_receipts` 和 `task_gap_ledger` | Worker 测试报告 `no such table: search_event_receipts` | `npm test -- --run test/task-gaps.test.ts`：14 项通过 | 稳定 `gapId`、事件幂等、零/低结果聚合、状态台账 |
| LOOP-202 | 根据需求量、零结果比例、低结果比例和资源稀缺度计算 0—100 优先级 | 评分函数尚不存在 | 同上，评分边界测试通过 | 评分可解释、封顶 100，达到阈值才升级 |
| LOOP-701 | 每日 Cron 清理过期数据并刷新缺口状态 | 缺口刷新函数和迁移尚不存在 | Worker 完整 `npm run check`：44 项通过；新增清理用例随目标测试通过 | 调度幂等，`qualified` 只升级一次，过期观察数据被清理 |
| LOOP-702 | `observed`、`qualified` 状态写入一次性台账 | 台账表不存在 | Worker 目标测试通过 | 每个缺口每类状态事件仅保留一条 |
| 部署依赖 | Worker 与 Pages 工作流依次应用两份 D1 Schema | `deployment-workflows.test.mjs` 的两个工作流断言失败 | `node --test test/content/deployment-workflows.test.mjs`：5 项通过 | 生产代码不会先于缺口表部署 |

## 完整验证

- `yarn lint`：通过。
- `yarn typecheck`：通过。
- `yarn test`：30 个 Jest 套件、124 项测试以及 62 项内容测试全部通过。
- `yarn build`：成功生成 82 个静态页面。
- `npm --prefix worker run check`：2 个 Vitest 文件、44 项测试全部通过。
- `npm --prefix worker run dry-run`：成功生成 Worker 部署包，gzip 5.51 KiB。

## 覆盖率与已知缺口

前端目标覆盖命令：

```text
yarn jest lib/search-gap-client.test.ts components/resource-directory-client.test.tsx --runInBand --coverage --collectCoverageFrom=lib/search-gap-client.ts --collectCoverageFrom=components/resource-directory-client.tsx
```

结果：语句覆盖率 85.93%，核心 `search-gap-client.ts` 语句覆盖率 91.66%。

Worker 当前未安装 `@vitest/coverage-v8`，因此本次没有生成 Worker 行覆盖率；接口、D1 聚合、隐私、幂等、评分、升级、清理和迁移由 14 项目标测试及 44 项全量测试覆盖。后续如需要把 Worker 覆盖率设为 CI 硬门，应单独评审并锁定覆盖率依赖。

本次未执行任何远程 D1 迁移或生产部署。M0 后续仍需建设维护者缺口报告/看板，以及从 `qualified` 队列创建建设 Issue 的流程；AI 候选审核属于 M1。

## TDD 检查点

- RED：`f5898d6 test: define search gap foundation red baseline`
- GREEN：在本报告对应实现提交中保存；若后续 squash，需保留本报告中的 RED/GREEN 证据。
