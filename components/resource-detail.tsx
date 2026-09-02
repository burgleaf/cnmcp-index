import tagsRegistry from "@/catalog/tags.json";
import type { Resource, TagGroup } from "@/lib/catalog-types";
import Link from "next/link";

import { AiInstallPanel } from "./ai-install-panel";
import { MarkdownContent } from "./markdown-content";
import { ResourceStats } from "./resource-stats";
import { SafeImage } from "./safe-image";
import { StatsProvider } from "./stats-provider";
import { TagLink } from "./tag-link";
import { TrackedResourceLink } from "./tracked-resource-link";

const KIND_LABELS = { mcp: "MCP", skill: "Skill", plugin: "Plugin" } as const;
const KIND_CONTENT = {
  mcp: "一个可连接外部工具或数据源的 MCP 服务",
  skill: "一套可复用、可按需加载的 AI 工作方法",
  plugin: "一个为 AI 工具添加工作流、工具或界面能力的扩展",
} as const;

const KIND_EXPLAINERS = [
  ["Skill", "把一套可复用的任务方法交给 AI 按需执行。"],
  ["MCP", "让 AI 安全连接外部工具、数据和服务。"],
  ["Plugin", "为 AI 工具增加打包的功能、工作流或界面。"],
] as const;
const MAINTENANCE_LABELS = { active: "活跃", "low-activity": "低活跃", archived: "已归档" } as const;
const tagLookup = new Map(tagsRegistry.tags.map((tag) => [tag.id, tag]));

function tagsInGroups(resource: Resource, groups: ReadonlyArray<TagGroup>) {
  return resource.tags.flatMap((id) => {
    const tag = tagLookup.get(id);
    return tag && groups.includes(tag.group as TagGroup) ? [tag] : [];
  });
}

function ExternalLink({ href, children }: Readonly<{ href: string; children: React.ReactNode }>) {
  return <a className="font-medium text-brand underline decoration-blue-200 underline-offset-4 hover:text-blue-700" href={href} rel="noopener noreferrer" target="_blank">{children}</a>;
}

export function ResourceDetail({ resource }: Readonly<{ resource: Resource }>) {
  const image = resource.preview ?? resource.logo;
  const audiences = tagsInGroups(resource, ["profession", "industry"]);
  const capabilities = tagsInGroups(resource, ["task", "capability"]);
  const maintenanceStatus = resource.quality?.maintenanceStatus ?? "low-activity";

  return (
    <main className="mx-auto max-w-6xl px-6 py-10 md:py-14">
      <article>
        <nav aria-label="面包屑" className="mb-6 text-sm text-slate-600"><Link className="hover:text-brand" href="/resources">资源目录</Link><span className="mx-2">/</span><span>{KIND_LABELS[resource.kind]}</span></nav>

        <header className="grid gap-8 border-b border-slate-200 pb-10 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-sm"><span className="rounded-full bg-blue-50 px-3 py-1 font-semibold text-brand">{KIND_LABELS[resource.kind]}</span>{resource.featured ? <span className="rounded-full bg-violet-50 px-3 py-1 font-semibold text-violet-700">编辑精选</span> : null}</div>
            <div className="mt-5 flex gap-5">
              {image ? <SafeImage alt={`${resource.name} 预览图`} className="hidden h-24 w-24 shrink-0 rounded-2xl border border-slate-200 object-cover sm:block" src={image} /> : null}
              <div><h1 className="text-balance text-4xl font-bold tracking-tight text-ink md:text-5xl">{resource.name}</h1>{resource.nameEn && resource.nameEn !== resource.name ? <p className="mt-2 text-lg text-slate-600">{resource.nameEn}</p> : null}</div>
            </div>
            <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-700">{resource.summary}</p>
            <ul aria-label="资源标签" className="mt-5 flex flex-wrap gap-2">{resource.tags.map((tag) => <li key={tag}><TagLink compact tagId={tag} /></li>)}</ul>
          </div>

          <section aria-labelledby="source-heading" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">来源可核验</p>
            <h2 className="mt-2 text-xl font-bold text-ink" id="source-heading">公开 GitHub 仓库</h2>
            <p className="mt-2 break-words text-sm leading-6 text-slate-600">本站内容对应原作者公开仓库；Stars、Forks 与活跃时间来自可追溯的仓库快照，安装前请回到原仓库核对最新说明。</p>
            <TrackedResourceLink ariaLabel={`查看原仓库：${resource.name}`} className="mt-4 inline-flex w-full items-center justify-center rounded-lg bg-ink px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700" href={resource.repository} resourceId={resource.id}>查看原仓库 ↗</TrackedResourceLink>
          </section>
        </header>

        <section aria-labelledby="decision-heading" className="py-10">
          <div className="mb-5"><p className="text-sm font-semibold text-brand">先判断是否适合你</p><h2 className="mt-1 text-2xl font-bold text-ink" id="decision-heading">快速了解这个资源</h2></div>
          <div className="grid overflow-hidden rounded-2xl border border-slate-200 bg-white sm:grid-cols-2 lg:grid-cols-4">
            <div className="border-b border-slate-200 p-5 sm:border-r lg:border-b-0"><h3 className="font-semibold text-ink">解决什么问题</h3><p className="mt-2 text-sm leading-6 text-slate-600">{resource.summary}</p></div>
            <div className="border-b border-slate-200 p-5 lg:border-b-0 lg:border-r"><h3 className="font-semibold text-ink">适合谁</h3><p className="mt-2 text-sm leading-6 text-slate-600">{audiences.length ? audiences.map((tag) => tag.name).join("、") : "希望扩展 AI 工作能力的个人与团队"}</p></div>
            <div className="border-b border-slate-200 p-5 sm:border-b-0 sm:border-r"><h3 className="font-semibold text-ink">核心能力</h3><p className="mt-2 text-sm leading-6 text-slate-600">{capabilities.length ? capabilities.slice(0, 6).map((tag) => tag.name).join("、") : resource.tags.slice(0, 6).join("、")}</p></div>
            <div className="p-5"><h3 className="font-semibold text-ink">包含内容</h3><p className="mt-2 text-sm leading-6 text-slate-600">{KIND_CONTENT[resource.kind]}</p></div>
          </div>
        </section>

        <section aria-labelledby="kind-guide-heading" className="rounded-2xl border border-blue-100 bg-blue-50 p-5 md:p-6">
          <p className="text-sm font-semibold text-brand">资源类型说明</p>
          <h2 className="mt-1 text-xl font-bold text-ink" id="kind-guide-heading">这是一个 {KIND_LABELS[resource.kind]}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-700">{KIND_CONTENT[resource.kind]}。三种资源解决的问题不同，选择时以你的目标为准。</p>
          <ul className="mt-4 grid gap-3 md:grid-cols-3">
            {KIND_EXPLAINERS.map(([kind, description]) => <li className={`rounded-xl border bg-white p-4 text-sm leading-6 ${kind === KIND_LABELS[resource.kind] ? "border-brand ring-1 ring-brand/20" : "border-blue-100"}`} key={kind}><strong className="text-ink">{kind}</strong><p className="mt-1 text-slate-600">{description}</p></li>)}
          </ul>
        </section>

        <AiInstallPanel resource={resource} />

        <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start">
          <section aria-labelledby="description-heading" className="min-w-0 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
            <h2 className="text-2xl font-bold text-ink" id="description-heading">详细介绍</h2>
            <p className="mt-2 text-sm text-slate-500">由社区根据原仓库资料整理，完整信息与最新变化请以原仓库为准。</p>
            <div className="mt-6">{resource.readme ? <MarkdownContent markdown={resource.readme} /> : <p className="leading-7 text-slate-700">{resource.summary}</p>}</div>
          </section>

          <aside className="space-y-5">
            <section aria-labelledby="resource-info-heading" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-xl font-bold text-ink" id="resource-info-heading">资源信息</h2>
              <dl className="mt-4 space-y-4 text-sm">
                <div><dt className="text-slate-500">原作者</dt><dd className="mt-1 font-semibold text-ink">{resource.author.url ? <ExternalLink href={resource.author.url}>{resource.author.name}</ExternalLink> : resource.author.name}</dd></div>
                <div><dt className="text-slate-500">开源许可</dt><dd className="mt-1 font-semibold text-ink">{resource.license}</dd></div>
                <div><dt className="text-slate-500">资源类型</dt><dd className="mt-1 font-semibold text-ink">{KIND_LABELS[resource.kind]}</dd></div>
              </dl>
              <div aria-label="访问资源" className="mt-5 space-y-2 border-t border-slate-100 pt-4 text-sm">
                <TrackedResourceLink href={resource.repository} resourceId={resource.id}>查看源代码 ↗</TrackedResourceLink>
                {resource.homepage ? <div><TrackedResourceLink href={resource.homepage} resourceId={resource.id}>访问官网 ↗</TrackedResourceLink></div> : null}
                {resource.documentation ? <div><TrackedResourceLink href={resource.documentation} resourceId={resource.id}>阅读使用文档 ↗</TrackedResourceLink></div> : null}
              </div>
            </section>

            <section aria-labelledby="quality-heading" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-end justify-between gap-3"><h2 className="text-xl font-bold text-ink" id="quality-heading">质量与活跃度</h2><strong className="text-3xl text-brand">{resource.quality?.score ?? "—"}</strong></div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-slate-500">Stars</dt><dd className="mt-1 font-semibold">{(resource.quality?.stars ?? 0).toLocaleString("zh-CN")}</dd></div><div><dt className="text-slate-500">Forks</dt><dd className="mt-1 font-semibold">{(resource.quality?.forks ?? 0).toLocaleString("zh-CN")}</dd></div><div><dt className="text-slate-500">维护状态</dt><dd className="mt-1"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${maintenanceStatus === "active" ? "bg-emerald-50 text-emerald-800" : maintenanceStatus === "archived" ? "bg-slate-200 text-slate-700" : "bg-amber-50 text-amber-800"}`}>{MAINTENANCE_LABELS[maintenanceStatus]}</span></dd></div><div><dt className="text-slate-500">最近推送</dt><dd className="mt-1 font-semibold">{resource.quality?.pushedAt?.slice(0, 10) ?? "未知"}</dd></div></dl>
              <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">数据更新时间：{resource.quality?.dataUpdatedAt ?? resource.sourceStats?.fetchedAt ?? "尚未同步"}</p>
            </section>

            <section aria-labelledby="stats-heading" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-xl font-bold text-ink" id="stats-heading">社区关注</h2><div className="mt-3 rounded-lg bg-slate-100 p-3 text-sm"><StatsProvider resourceIds={[resource.id]}><ResourceStats resourceId={resource.id} /></StatsProvider></div></section>
          </aside>
        </div>
      </article>
    </main>
  );
}
