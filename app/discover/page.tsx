import type { Metadata } from "next";
import Link from "next/link";

import { getAllResources } from "@/lib/catalog";
import { PRODUCTION_SITE_URL } from "@/lib/env";

export const metadata: Metadata = {
  title: "资源动态",
  description: "追踪 CNMCP 已收录 Skill、MCP 与 Plugin 的 GitHub Stars、Forks 和维护活跃度。",
  alternates: { canonical: `${PRODUCTION_SITE_URL}/discover/` },
};

function displayDate(value: string | null | undefined) {
  return value ? value.slice(0, 10) : "暂无公开记录";
}

const MAINTENANCE_LABELS = { active: "活跃", "low-activity": "低活跃", archived: "已归档" } as const;

export default function DiscoverPage() {
  const resources = getAllResources()
    .slice()
    .sort((left, right) => (right.quality?.pushedAt ?? "").localeCompare(left.quality?.pushedAt ?? ""));

  return (
    <main className="mx-auto min-h-[calc(100vh-145px)] max-w-6xl px-6 py-12">
      <header className="mb-8 max-w-3xl">
        <p className="text-sm font-semibold tracking-[0.18em] text-brand">可验证的项目动态</p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight">已收录资源的维护动态</h1>
        <p className="mt-4 leading-7 text-slate-600">
          这里只展示已收录资源的公开 GitHub 快照：Stars、Forks、最近推送与抓取日期。它们帮助判断维护活跃度，
          但不代替你在原仓库核对安全性、许可证和最新安装说明。
        </p>
      </header>
      <section aria-label="资源维护动态" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-4 text-sm font-semibold text-slate-600 sm:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(5rem,0.6fr))_auto]">
          <span>资源</span><span className="hidden sm:block">Stars</span><span className="hidden sm:block">Forks</span><span className="hidden sm:block">最近推送</span><span>来源</span>
        </div>
        <ul>
          {resources.map((resource) => (
            <li className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 border-b border-slate-100 px-5 py-4 last:border-b-0 sm:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(5rem,0.6fr))_auto] sm:items-center" key={resource.id}>
              <div><Link className="font-semibold text-ink hover:text-brand" href={`/resources/${resource.id}`}>{resource.name}</Link><p className="mt-1 text-xs text-slate-500">{resource.kind.toUpperCase()} · 数据更新 {displayDate(resource.quality?.dataUpdatedAt ?? resource.sourceStats?.fetchedAt)}</p></div>
              <span className="hidden text-sm text-slate-700 sm:block">{(resource.quality?.stars ?? 0).toLocaleString("zh-CN")}</span>
              <span className="hidden text-sm text-slate-700 sm:block">{(resource.quality?.forks ?? 0).toLocaleString("zh-CN")}</span>
              <span className="hidden text-sm text-slate-700 sm:block">{displayDate(resource.quality?.pushedAt)} · {MAINTENANCE_LABELS[resource.quality?.maintenanceStatus ?? "low-activity"]}</span>
              <a className="text-sm font-semibold text-brand hover:underline" href={resource.repository} rel="noopener noreferrer" target="_blank">GitHub ↗</a>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
