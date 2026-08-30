import type { Platform, Resource } from "@/lib/catalog-types";

import { InstallPanel } from "./install-panel";
import { MarkdownContent } from "./markdown-content";
import { PlatformBadge } from "./platform-badge";
import { ResourceStats } from "./resource-stats";
import { SafeImage } from "./safe-image";
import { StatsProvider } from "./stats-provider";
import { TrackedResourceLink } from "./tracked-resource-link";

const KIND_LABELS = {
  mcp: "MCP",
  skill: "Skill",
  plugin: "AI 编程插件",
} as const;

function ExternalLink({ href, children }: Readonly<{ href: string; children: React.ReactNode }>) {
  return (
    <a className="font-medium text-brand underline decoration-blue-200 underline-offset-4 hover:text-blue-700" href={href} rel="noopener noreferrer" target="_blank">
      {children}
    </a>
  );
}

export function ResourceDetail({
  resource,
  platforms,
}: Readonly<{
  resource: Resource;
  platforms: ReadonlyArray<Platform>;
}>) {
  const platformNames = new Map(platforms.map((platform) => [platform.id, platform.name]));
  const image = resource.preview ?? resource.logo;

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <article>
        <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-full bg-blue-50 px-3 py-1 font-semibold text-brand">{KIND_LABELS[resource.kind]}</span>
            {resource.featured ? <span className="rounded-full bg-violet-50 px-3 py-1 font-semibold text-violet-700">精选</span> : null}
          </div>
          <div className="mt-5 grid gap-6 md:grid-cols-[1fr_auto] md:items-start">
            <div>
              <h1 className="text-4xl font-bold tracking-tight text-ink">{resource.name}</h1>
              {resource.nameEn && resource.nameEn !== resource.name ? <p className="mt-2 text-lg text-slate-500">{resource.nameEn}</p> : null}
              <p className="mt-4 max-w-3xl text-lg leading-8 text-slate-700">{resource.summary}</p>
            </div>
            {image ? <SafeImage alt={`${resource.name} 预览图`} className="h-36 w-36 rounded-2xl border border-slate-200 object-cover" src={image} /> : null}
          </div>

          <dl className="mt-7 grid gap-4 border-t border-slate-100 pt-6 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div><dt className="font-medium text-slate-500">作者</dt><dd className="mt-1 text-ink">{resource.author.url ? <ExternalLink href={resource.author.url}>{resource.author.name}</ExternalLink> : resource.author.name}</dd></div>
            <div><dt className="font-medium text-slate-500">许可证</dt><dd className="mt-1 text-ink">{resource.license}</dd></div>
            <div><dt className="font-medium text-slate-500">收录日期</dt><dd className="mt-1 text-ink">{resource.createdAt}</dd></div>
            <div><dt className="font-medium text-slate-500">最近更新</dt><dd className="mt-1 text-ink">{resource.updatedAt ?? "未单独标注"}</dd></div>
          </dl>

          <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <TrackedResourceLink href={resource.repository} resourceId={resource.id}>源码仓库</TrackedResourceLink>
            {resource.homepage ? <TrackedResourceLink href={resource.homepage} resourceId={resource.id}>官方网站</TrackedResourceLink> : null}
            {resource.documentation ? <TrackedResourceLink href={resource.documentation} resourceId={resource.id}>使用文档</TrackedResourceLink> : null}
          </div>
          <ul aria-label="资源标签" className="mt-5 flex flex-wrap gap-2">
            {resource.tags.map((tag) => <li className="rounded-md bg-slate-100 px-2.5 py-1 text-sm text-slate-700" key={tag}>#{tag}</li>)}
          </ul>
        </header>

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <section aria-labelledby="description-heading" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
            <h2 className="text-2xl font-bold text-ink" id="description-heading">资源说明</h2>
            <div className="mt-5">
              {resource.readme ? <MarkdownContent markdown={resource.readme} /> : <p className="leading-7 text-slate-700">{resource.summary}</p>}
            </div>
          </section>

          <aside className="space-y-5">
            <section aria-labelledby="compatibility-heading" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-xl font-bold text-ink" id="compatibility-heading">平台兼容性</h2>
              <div className="mt-4 space-y-4">
                {resource.compatibility.map((entry) => {
                  const platformName = platformNames.get(entry.platform) ?? entry.platform;
                  return (
                    <div className="border-b border-slate-100 pb-4 last:border-0 last:pb-0" key={entry.platform}>
                      <PlatformBadge platformName={platformName} status={entry.status} verifiedAt={entry.verifiedAt} />
                      <p className="mt-2 text-xs text-slate-600">最后核验日期：{entry.verifiedAt}</p>
                      {entry.note ? <p className="mt-2 text-sm leading-6 text-slate-700">{entry.note}</p> : null}
                    </div>
                  );
                })}
              </div>
            </section>

            <section aria-labelledby="stats-heading" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-xl font-bold text-ink" id="stats-heading">资源统计</h2>
              <div className="mt-3 rounded-lg bg-slate-100 p-3 text-sm">
                <StatsProvider resourceIds={[resource.id]}>
                  <ResourceStats resourceId={resource.id} />
                </StatsProvider>
              </div>
            </section>
          </aside>
        </div>

        <div className="mt-8">
          <InstallPanel compatibility={resource.compatibility} platforms={platforms} resourceId={resource.id} />
        </div>
      </article>
    </main>
  );
}
