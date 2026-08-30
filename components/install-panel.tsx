"use client";

import { useState } from "react";

import type { Installation, Platform, PlatformCompatibility } from "@/lib/catalog-types";
import { recordStatsEvent } from "@/lib/stats-client";

import { PlatformBadge } from "./platform-badge";

const SHELL_LABELS = {
  bash: "Bash",
  powershell: "PowerShell",
  cmd: "Windows CMD",
  any: "任意 Shell",
} as const;

const INSTALLATION_LABELS = {
  command: "安装命令",
  config: "配置片段",
  manual: "手动操作",
  link: "安装链接",
} as const;

type CopyPayload = Readonly<{
  platformId: string;
  installationType: "command" | "config";
}>;

type CopyState = Readonly<{
  kind: "success" | "failed";
  text: string;
}>;

function copyableText(installation: Installation): string | null {
  if (installation.type === "command") return installation.command ?? null;
  if (installation.type === "config") return installation.content ?? null;
  return null;
}

function operationLocation(installation: Installation): string {
  if (installation.target) return installation.target;
  if (installation.type === "command") return "本机终端（站点只复制文本，不会执行）";
  if (installation.type === "link") return "外部安装或说明页面";
  return "请按说明在目标 AI 编程工具中操作";
}

function InstallationCard({
  installation,
  platformId,
  stateKey,
  copyState,
  onCopy,
}: Readonly<{
  installation: Installation;
  platformId: string;
  stateKey: string;
  copyState?: CopyState;
  onCopy: (stateKey: string, platformId: string, installation: Installation) => Promise<void>;
}>) {
  const text = copyableText(installation);

  return (
    <article className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="font-semibold text-ink">{installation.label ?? INSTALLATION_LABELS[installation.type]}</h4>
          {installation.type === "command" ? (
            <p className="mt-1 text-xs text-slate-600">
              Shell：{installation.shell ? SHELL_LABELS[installation.shell] : "未指定，请根据命令语法确认"}
            </p>
          ) : null}
          <p className="mt-1 text-xs text-slate-600">操作位置：{operationLocation(installation)}</p>
        </div>
        {text ? (
          <button
            className="rounded-lg border border-brand px-3 py-2 text-sm font-semibold text-brand hover:bg-blue-50"
            onClick={() => void onCopy(stateKey, platformId, installation)}
            type="button"
          >
            复制{installation.type === "command" ? "命令" : "配置"}
          </button>
        ) : null}
      </div>

      {installation.type === "command" ? (
        <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-950 p-3 text-sm text-slate-100"><code>{installation.command}</code></pre>
      ) : null}
      {installation.type === "config" ? (
        <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-950 p-3 text-sm text-slate-100"><code>{installation.content}</code></pre>
      ) : null}
      {installation.type === "manual" ? (
        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{installation.content}</p>
      ) : null}
      {installation.type === "link" && installation.url ? (
        <a
          className="mt-3 inline-flex font-semibold text-brand underline underline-offset-4"
          href={installation.url}
          rel="noopener noreferrer"
          target="_blank"
        >
          打开外部安装说明
        </a>
      ) : null}

      {installation.placeholders?.length ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm font-semibold text-amber-950">复制后必须替换以下占位符</p>
          <ul className="mt-2 space-y-2 text-sm text-amber-950">
            {installation.placeholders.map((placeholder) => (
              <li key={placeholder.name}>
                <code className="font-semibold">{placeholder.name}</code>：{placeholder.description}
                {placeholder.secret ? (
                  <strong className="ml-2 rounded bg-red-100 px-2 py-0.5 text-xs text-red-800">Secret 敏感值，请勿提交或分享</strong>
                ) : (
                  <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-xs">普通变量</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {copyState?.kind === "success" ? (
        <p aria-live="polite" className="mt-3 text-sm font-medium text-emerald-700" role="status">
          已复制到剪贴板。站点不会执行该内容，请核对后自行操作。
        </p>
      ) : null}
      {copyState?.kind === "failed" ? (
        <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3" role="alert">
          <p className="text-sm font-medium text-amber-950">剪贴板不可用，请在下方手动选择并复制；未记录复制成功。</p>
          <textarea
            aria-label="可手动选择的安装文本"
            className="mt-2 min-h-24 w-full rounded border border-amber-300 bg-white p-2 font-mono text-xs"
            readOnly
            value={copyState.text}
          />
          <button
            className="mt-2 rounded border border-amber-700 px-3 py-1.5 text-sm font-semibold text-amber-900"
            onClick={(event) => {
              const textarea = event.currentTarget.parentElement?.querySelector("textarea");
              textarea?.focus();
              textarea?.select();
            }}
            type="button"
          >
            选择文本
          </button>
        </div>
      ) : null}
    </article>
  );
}

export function InstallPanel({
  compatibility,
  platforms,
  resourceId,
  onCopySuccess,
}: Readonly<{
  compatibility: ReadonlyArray<PlatformCompatibility>;
  platforms: ReadonlyArray<Platform>;
  resourceId: string;
  onCopySuccess?: (payload: CopyPayload) => void;
}>) {
  const [copyStates, setCopyStates] = useState<Readonly<Record<string, CopyState>>>({});
  const platformNames = new Map(platforms.map((platform) => [platform.id, platform.name]));

  const handleCopy = async (stateKey: string, platformId: string, installation: Installation) => {
    const text = copyableText(installation);
    if (!text) return;

    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(text);
      setCopyStates((current) => ({ ...current, [stateKey]: { kind: "success", text } }));
      onCopySuccess?.({ platformId, installationType: installation.type as "command" | "config" });
      void recordStatsEvent(resourceId, "command_copy").catch(() => undefined);
    } catch {
      setCopyStates((current) => ({ ...current, [stateKey]: { kind: "failed", text } }));
    }
  };

  return (
    <section aria-labelledby="install-heading" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-2xl font-bold text-ink" id="install-heading">按平台安装</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        站点只展示和复制文本，绝不会自动执行命令。执行前请检查源码、占位符、权限和目标位置。
      </p>
      <div className="mt-6 space-y-5">
        {compatibility.map((entry) => {
          const platformName = platformNames.get(entry.platform) ?? entry.platform;
          return (
            <section className="rounded-xl border border-slate-200 p-4" key={entry.platform}>
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-lg font-semibold text-ink">{platformName}</h3>
                <PlatformBadge platformName={platformName} status={entry.status} verifiedAt={entry.verifiedAt} />
              </div>
              <p className="mt-2 text-sm text-slate-600">最后核验日期：{entry.verifiedAt}</p>
              {entry.status === "partial" ? (
                <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                  部分支持限制：{entry.note}
                </p>
              ) : entry.note ? (
                <p className="mt-3 text-sm text-slate-700">说明：{entry.note}</p>
              ) : null}

              {entry.status === "unsupported" ? (
                <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm font-medium text-red-800">
                  该平台当前不支持，不提供安装入口。
                </p>
              ) : entry.installations?.length ? (
                <div className="mt-4 space-y-3">
                  {entry.installations.map((installation, index) => {
                    const stateKey = `${entry.platform}:${index}`;
                    return (
                      <InstallationCard
                        copyState={copyStates[stateKey]}
                        installation={installation}
                        key={stateKey}
                        onCopy={handleCopy}
                        platformId={entry.platform}
                        stateKey={stateKey}
                      />
                    );
                  })}
                </div>
              ) : (
                <p className="mt-4 rounded-lg bg-slate-100 p-3 text-sm text-slate-700">
                  此兼容状态暂未提供可复制的安装说明，请前往资源源码或文档确认。
                </p>
              )}
            </section>
          );
        })}
      </div>
    </section>
  );
}
