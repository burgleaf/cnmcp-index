import Link from "next/link";

import { ResourceGallery } from "@/components/resource-gallery";
import { getAllResources, getEnabledPlatforms } from "@/lib/catalog";

export default function HomePage() {
  const resources = getAllResources();
  const platforms = getEnabledPlatforms();
  const featured = resources.filter((resource) => resource.featured);
  const recent = resources.slice(0, 6);

  return (
    <main>
      <section className="border-b border-blue-100 bg-gradient-to-b from-blue-50 to-surface">
        <div className="mx-auto max-w-6xl px-6 py-20 text-center">
          <p className="text-sm font-semibold tracking-[0.2em] text-brand">面向 AI 开发工具用户</p>
          <h1 className="mt-4 text-balance text-4xl font-bold tracking-tight sm:text-6xl">发现可靠的 AI 扩展资源</h1>
          <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg leading-8 text-slate-600">CNMCP AI 扩展社区收录 MCP、Skill 和 AI 编程工具插件。目录内容来自社区审核后合并的 Git 仓库。</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link className="rounded-lg bg-brand px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700" href="/resources">浏览资源目录</Link>
            <Link className="rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-ink hover:border-brand" href="/platform/codex">查看 Codex 资源</Link>
          </div>
          <p className="mt-5 text-sm text-slate-500">页面静态提供；统计服务暂时不可用时，资源内容仍可正常访问。</p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-14" aria-labelledby="featured-heading">
        <div className="mb-7">
          <p className="text-sm font-semibold text-brand">维护者精选</p>
          <h2 className="mt-2 text-3xl font-bold" id="featured-heading">精选资源</h2>
        </div>
        <ResourceGallery emptyDescription="当前没有由维护者标记为 featured 的公开资源。" emptyTitle="暂无精选资源" platforms={platforms} resources={featured} />
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-16" aria-labelledby="recent-heading">
        <div className="mb-7">
          <p className="text-sm font-semibold text-brand">按收录日期排序</p>
          <h2 className="mt-2 text-3xl font-bold" id="recent-heading">最近收录</h2>
        </div>
        <ResourceGallery emptyDescription="正式 Catalog 当前为空；资源经审核合并后会显示在这里。" emptyTitle="暂无最近收录资源" platforms={platforms} resources={recent} />
      </section>
    </main>
  );
}
