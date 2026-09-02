"use client";

import { useMemo, useState } from "react";

import { createInstallGuides, type InstallPlatformId } from "@/lib/ai-install-prompt";
import type { Resource } from "@/lib/catalog-types";
import { recordStatsEvent } from "@/lib/stats-client";

export function AiInstallPanel({ resource }: Readonly<{ resource: Resource }>) {
  const guides = useMemo(() => createInstallGuides(resource), [resource]);
  const [activeId, setActiveId] = useState<InstallPlatformId>("codex");
  const [state, setState] = useState<"idle" | "success" | "failed">("idle");
  const active = guides.find((guide) => guide.id === activeId) ?? guides[0];

  async function copyContent() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(active.content);
      setState("success");
      void recordStatsEvent(resource.id, "command_copy").catch(() => undefined);
    } catch {
      setState("failed");
    }
  }

  function selectWithKeyboard(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % guides.length;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + guides.length) % guides.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = guides.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    const next = guides[nextIndex];
    setActiveId(next.id);
    setState("idle");
    document.getElementById(`install-tab-${next.id}`)?.focus();
  }

  return (
    <section aria-labelledby="install-heading" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-6 py-5 md:px-8">
        <p className="text-sm font-semibold text-brand">选择你正在使用的工具</p>
        <h2 className="mt-1 text-2xl font-bold text-ink" id="install-heading">快速安装</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">优先显示原项目提供的内容；没有统一命令时，只复制一条简短提示词交给当前 AI 工具。</p>
      </div>
      <div aria-label="安装平台" className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-slate-50 px-3 pt-3" role="tablist">
        {guides.map((guide, index) => (
          <button
            aria-controls="install-panel"
            aria-selected={active.id === guide.id}
            className={`whitespace-nowrap rounded-t-lg border border-b-0 px-4 py-2.5 text-sm font-semibold transition ${active.id === guide.id ? "border-slate-200 bg-white text-brand" : "border-transparent text-slate-500 hover:text-ink"}`}
            id={`install-tab-${guide.id}`}
            key={guide.id}
            onClick={() => { setActiveId(guide.id); setState("idle"); }}
            onKeyDown={(event) => selectWithKeyboard(event, index)}
            role="tab"
            type="button"
          >
            {guide.name}
          </button>
        ))}
      </div>
      <div aria-labelledby={`install-tab-${active.id}`} className="p-6 md:p-8" id="install-panel" role="tabpanel">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold text-ink">{active.label}</h3>
          <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">{active.source === "upstream" ? "原项目提供" : active.contentType === "command" ? "平台命令" : "简短提示词"}</span>
        </div>
        <p className="mt-2 text-sm leading-6 text-slate-600">{active.description}</p>
        <pre className="mt-4 overflow-x-auto whitespace-pre-wrap break-words rounded-xl bg-slate-950 p-4 text-sm leading-6 text-slate-100"><code>{active.content}</code></pre>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <button className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700" onClick={() => void copyContent()} type="button">复制安装内容</button>
          <a className="text-sm font-semibold text-brand hover:underline" href={active.docsUrl} rel="noopener noreferrer" target="_blank">查看平台安装依据 ↗</a>
          <a className="text-sm font-semibold text-slate-600 hover:text-ink" href={resource.repository} rel="noopener noreferrer" target="_blank">核对原仓库 ↗</a>
        </div>
        {state === "success" ? <p aria-live="polite" className="mt-4 text-sm font-semibold text-emerald-700" role="status">安装内容已复制。</p> : null}
        {state === "failed" ? <div className="mt-5" role="alert"><p className="text-sm font-semibold text-amber-900">剪贴板不可用，请手动复制。</p><textarea aria-label="安装内容" className="mt-2 min-h-32 w-full rounded-xl border border-slate-300 bg-slate-50 p-4 text-sm leading-6 text-slate-700" readOnly value={active.content} /></div> : null}
      </div>
    </section>
  );
}
