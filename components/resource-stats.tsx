"use client";

import { useResourceStats } from "./stats-provider";

export function ResourceStats({ resourceId }: Readonly<{ resourceId: string }>) {
  const state = useResourceStats(resourceId);

  if (state.status === "loading") {
    return <p aria-label="统计数据状态" className="text-slate-600">统计数据加载中…</p>;
  }
  if (state.status === "unavailable") {
    return (
      <p aria-label="统计数据状态" className="text-slate-600">
        统计服务暂不可用；复制次数与外链访问次数未加载，不能按 0 展示。静态内容不受影响。
      </p>
    );
  }

  return (
    <dl aria-label={state.status === "empty" ? "统计数据为空" : "统计数据可用"} className="space-y-1 text-slate-700">
      <div className="flex justify-between gap-3"><dt>命令/配置复制次数</dt><dd>{state.value.commandCopies}</dd></div>
      <div className="flex justify-between gap-3"><dt>聚合外链访问次数</dt><dd>{state.value.sourceVisits}</dd></div>
    </dl>
  );
}
