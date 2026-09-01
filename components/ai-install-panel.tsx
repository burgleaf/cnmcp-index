"use client";

import { useMemo, useState } from "react";

import type { Platform, Resource } from "@/lib/catalog-types";
import { createAiInstallPrompt } from "@/lib/ai-install-prompt";
import { recordStatsEvent } from "@/lib/stats-client";

export function AiInstallPanel({ resource, platforms }: Readonly<{ resource: Resource; platforms: ReadonlyArray<Platform> }>) {
  const prompt = useMemo(() => createAiInstallPrompt(resource, platforms), [resource, platforms]);
  const [state, setState] = useState<"idle" | "success" | "failed">("idle");

  async function copyPrompt() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(prompt);
      setState("success");
      void recordStatsEvent(resource.id, "command_copy").catch(() => undefined);
    } catch {
      setState("failed");
    }
  }

  return (
    <section aria-labelledby="ai-install-heading" className="rounded-2xl border border-blue-200 bg-blue-50 p-6 md:p-8">
      <p className="text-sm font-semibold text-brand">适用于不同 AI 助手</p>
      <h2 className="mt-2 text-2xl font-bold text-ink" id="ai-install-heading">让 AI 帮你分析并安装</h2>
      <p className="mt-3 max-w-3xl leading-7 text-slate-700">复制提示词发给你正在使用的 AI 助手。它会先核对上游文档和本机环境，再说明风险并请求确认；提示词不会把“跨助手可读”误写成“资源兼容所有平台”。</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <button className="rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700" onClick={() => void copyPrompt()} type="button">复制 AI 安装提示词</button>
        <a className="rounded-xl border border-blue-300 bg-white px-5 py-3 text-sm font-semibold text-brand hover:border-brand" href={resource.documentation ?? resource.repository} rel="noopener noreferrer" target="_blank">先查看官方文档</a>
      </div>
      {state === "success" ? <p aria-live="polite" className="mt-4 text-sm font-semibold text-emerald-700" role="status">提示词已复制。请粘贴给你的 AI 助手，并在执行高风险操作前自行确认。</p> : null}
      {state === "failed" ? <div className="mt-5" role="alert"><p className="text-sm font-semibold text-amber-900">剪贴板不可用，请手动复制下方提示词。</p><textarea aria-label="AI 安装提示词" className="mt-2 min-h-72 w-full rounded-xl border border-blue-200 bg-white p-4 text-sm leading-6 text-slate-700" readOnly value={prompt} /></div> : null}
      <details className="mt-5"><summary className="cursor-pointer text-sm font-semibold text-brand">预览提示词</summary><pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-950 p-4 text-xs leading-6 text-slate-100"><code>{prompt}</code></pre></details>
    </section>
  );
}
