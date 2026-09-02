"use client";

import { useMemo, useState } from "react";

import {
  buildAgentSubmissionPrompt,
  parseGitHubRepositoryInput,
} from "@/lib/submission";

type CopyState = Readonly<{
  kind: "success" | "failed";
  text: string;
}>;

export function AgentSubmissionPrompt({
  catalogRepositoryUrl,
}: Readonly<{
  catalogRepositoryUrl: string;
}>) {
  const [sourceRepositoryUrl, setSourceRepositoryUrl] = useState("");
  const [copyState, setCopyState] = useState<CopyState | null>(null);

  const parsedSource = useMemo(
    () => parseGitHubRepositoryInput(sourceRepositoryUrl),
    [sourceRepositoryUrl],
  );
  const prompt = useMemo(
    () =>
      parsedSource
        ? buildAgentSubmissionPrompt({
            sourceRepositoryUrl: parsedSource.url,
            catalogRepositoryUrl,
          })
        : null,
    [catalogRepositoryUrl, parsedSource],
  );
  const showInvalidHint = sourceRepositoryUrl.trim().length > 0 && !parsedSource;

  const handleCopy = async () => {
    if (!prompt) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(prompt);
      setCopyState({ kind: "success", text: prompt });
    } catch {
      setCopyState({ kind: "failed", text: prompt });
    }
  };

  return (
    <section
      className="rounded-2xl border border-brand/20 bg-gradient-to-br from-blue-50 to-white p-6 shadow-sm md:p-8"
      aria-labelledby="agent-submission-heading"
    >
      <p className="text-sm font-semibold text-brand">推荐方式</p>
      <h2 className="mt-1 text-2xl font-bold text-ink" id="agent-submission-heading">
        用 AI 助手投稿
      </h2>
      <p className="mt-3 leading-7 text-slate-700">
        输入源码的公开 GitHub 仓库地址，复制提示词，粘贴到 Cursor、Codex 或其他能调用 GitHub 的 AI 助手。
        助手会读取仓库投稿 Skill，生成 <code>resource.json</code> 和 <code>README.md</code>，并通过 GitHub API 发起可审查、可合并的 PR。
        不需要完整克隆索引仓库。本站只生成文本，不会执行安装命令。
      </p>

      <div className="mt-6 space-y-3">
        <label className="block text-sm font-semibold text-ink" htmlFor="source-repository-url">
          源码 GitHub 仓库地址
        </label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            aria-invalid={showInvalidHint}
            autoComplete="url"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-ink shadow-sm outline-none ring-brand/30 placeholder:text-slate-400 focus:border-brand focus:ring-2"
            id="source-repository-url"
            inputMode="url"
            onChange={(event) => {
              setSourceRepositoryUrl(event.target.value);
              setCopyState(null);
            }}
            placeholder="https://github.com/owner/repository"
            spellCheck={false}
            type="url"
            value={sourceRepositoryUrl}
          />
          <button
            className="inline-flex shrink-0 items-center justify-center rounded-lg bg-brand px-4 py-2.5 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            disabled={!prompt}
            onClick={() => void handleCopy()}
            type="button"
          >
            复制提示词
          </button>
        </div>
        {showInvalidHint ? (
          <p className="text-sm text-red-700" role="alert">
            请输入 https://github.com/owner/repository 格式的公开仓库地址。
          </p>
        ) : (
          <p className="text-sm text-slate-600">
            目标索引仓库：
            <a
              className="ml-1 font-medium text-brand underline underline-offset-4"
              href={catalogRepositoryUrl}
              rel="noopener noreferrer"
              target="_blank"
            >
              {catalogRepositoryUrl}
            </a>
          </p>
        )}
        {copyState?.kind === "success" ? (
          <p aria-live="polite" className="text-sm font-medium text-emerald-700" role="status">
            已复制到剪贴板。请粘贴到你常用的 AI 助手，并在助手中连接 GitHub 后再发起 PR。
          </p>
        ) : null}
        {copyState?.kind === "failed" ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3" role="alert">
            <p className="text-sm font-medium text-amber-950">剪贴板不可用，请在下方文本框中手动选择并复制。</p>
            <button
              className="mt-2 rounded border border-amber-700 px-3 py-1.5 text-sm font-semibold text-amber-900"
              onClick={(event) => {
                const textarea = event.currentTarget
                  .closest("section")
                  ?.querySelector<HTMLTextAreaElement>("textarea");
                textarea?.focus();
                textarea?.select();
              }}
              type="button"
            >
              选择文本
            </button>
          </div>
        ) : null}
      </div>

      {prompt ? (
        <label className="mt-6 block">
          <span className="sr-only">可复制的投稿提示词</span>
          <textarea
            aria-label="可复制的投稿提示词"
            className="min-h-48 w-full rounded-xl border border-slate-200 bg-slate-950 p-4 font-mono text-xs leading-5 text-slate-100"
            readOnly
            value={prompt}
          />
        </label>
      ) : null}
    </section>
  );
}
