import Link from "next/link";

import { ResourceGallery } from "@/components/resource-gallery";
import { getAllResources, getResourcesByTag, getUsedTags } from "@/lib/catalog";

const SCENE_IDS = ["developer", "designer", "filmmaker", "director", "illustrator", "researcher", "educator", "marketer"];

export default function HomePage() {
  const resources = getAllResources();
  const featured = resources.filter((resource) => resource.featured);
  const qualityLeaders = resources.slice(0, 6);
  const scenes = getUsedTags().filter((tag) => SCENE_IDS.includes(tag.id));

  return (
    <main>
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-16 lg:grid-cols-[1.2fr_0.8fr] lg:items-center lg:py-20">
          <div>
            <p className="text-sm font-semibold tracking-[0.2em] text-brand">中文 AI 能力目录</p>
            <h1 className="mt-4 max-w-3xl text-balance text-4xl font-bold tracking-tight sm:text-6xl">从你要完成的工作出发，发现可靠的 AI 扩展</h1>
            <p className="mt-6 max-w-2xl text-pretty text-lg leading-8 text-slate-600">收录 MCP、Skill 和 AI 编程工具插件。按职业、任务和上游项目质量组织，不用先理解平台差异。</p>
            <form action="/resources" className="mt-8 flex max-w-2xl gap-2">
              <label className="sr-only" htmlFor="home-search">搜索资源</label>
              <input className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 outline-none focus:border-brand focus:ring-4 focus:ring-blue-100" id="home-search" name="q" placeholder="例如：导演分镜、绘图、长期记忆" type="search" />
              <button className="rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700" type="submit">浏览资源</button>
            </form>
          </div>
          <aside className="rounded-2xl border border-slate-200 bg-slate-50 p-6" aria-label="目录原则">
            <p className="text-sm font-semibold text-brand">质量优先</p><p className="mt-3 text-3xl font-bold">{resources.length} 个审核条目</p>
            <ul className="mt-5 space-y-3 text-sm leading-6 text-slate-600"><li>综合 Stars、Forks、活跃度、资料完整度和编辑审核</li><li>卡片不以平台数量或本站收录时间决定排序</li><li>安装交给你的 AI 助手分析，上游支持证据在详情页说明</li></ul>
          </aside>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-14" aria-labelledby="scenes-heading">
        <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-semibold text-brand">职业与目标</p><h2 className="mt-2 text-3xl font-bold" id="scenes-heading">按使用场景发现</h2></div><Link className="text-sm font-semibold text-brand hover:underline" href="/topics">查看全部主题 →</Link></div>
        <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{scenes.map((tag) => <Link className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-brand hover:shadow-sm" href={`/tags/${tag.id}`} key={tag.id}><p className="font-semibold text-ink">{tag.name}</p><p className="mt-1 text-sm text-slate-500">{tag.description}</p><p className="mt-3 text-xs font-semibold text-brand">{getResourcesByTag(tag.id).length} 个资源</p></Link>)}</div>
      </section>

      <section className="border-y border-slate-200 bg-white" aria-labelledby="quality-heading"><div className="mx-auto max-w-6xl px-6 py-14"><div className="mb-7"><p className="text-sm font-semibold text-brand">可解释排序</p><h2 className="mt-2 text-3xl font-bold" id="quality-heading">高质量资源</h2><p className="mt-3 max-w-3xl text-slate-600">默认排名不使用本站收录日期。Stars 权重 40%、活跃度 25%、Forks 10%、资料完整度 15%、编辑审核 10%，归档项目会显著降权。</p></div><ResourceGallery resources={qualityLeaders} /></div></section>

      <section className="mx-auto max-w-6xl px-6 py-14" aria-labelledby="featured-heading"><div className="mb-7"><p className="text-sm font-semibold text-brand">维护者精选</p><h2 className="mt-2 text-3xl font-bold" id="featured-heading">编辑精选</h2></div><ResourceGallery emptyDescription="维护者尚未标记精选资源。" emptyTitle="暂无精选资源" resources={featured} /></section>
    </main>
  );
}
