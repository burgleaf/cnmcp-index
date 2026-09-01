import type { Metadata } from "next";
import Link from "next/link";

import { getResourcesByTag, getUsedTags } from "@/lib/catalog";
import type { TagGroup } from "@/lib/catalog-types";
import { PRODUCTION_SITE_URL } from "@/lib/env";

export const metadata: Metadata = {
  title: "AI 使用场景与主题",
  description: "按职业、行业、目标任务和能力浏览 MCP、Skill 与 AI 插件。",
  alternates: { canonical: `${PRODUCTION_SITE_URL}/topics/` },
};

const GROUPS: ReadonlyArray<Readonly<{ id: TagGroup; name: string; description: string }>> = [
  { id: "profession", name: "适合谁", description: "从你的职业角色开始。" },
  { id: "industry", name: "用于什么行业", description: "进入熟悉的业务场景。" },
  { id: "task", name: "要完成什么", description: "直接按目标任务寻找资源。" },
  { id: "capability", name: "需要什么能力", description: "按技术能力继续探索。" },
];

export default function TopicsPage() {
  const tags = getUsedTags();
  return (
    <main className="mx-auto min-h-[calc(100vh-145px)] max-w-6xl px-6 py-12">
      <header className="max-w-3xl"><p className="text-sm font-semibold tracking-[0.18em] text-brand">主题导航</p><h1 className="mt-3 text-4xl font-bold tracking-tight">从使用场景找到 AI 资源</h1><p className="mt-4 leading-7 text-slate-600">不必先区分 MCP、Skill 或插件。选择你的角色和任务，再在结果中查看合适的实现形式。</p></header>
      <div className="mt-10 space-y-12">
        {GROUPS.map((group) => {
          const groupTags = tags.filter((tag) => tag.group === group.id);
          if (!groupTags.length) return null;
          return <section aria-labelledby={`group-${group.id}`} key={group.id}><h2 className="text-2xl font-bold" id={`group-${group.id}`}>{group.name}</h2><p className="mt-2 text-slate-600">{group.description}</p><div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{groupTags.map((tag) => <Link className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-brand hover:shadow-sm" href={`/tags/${tag.id}`} key={tag.id}><div className="flex items-center justify-between gap-3"><h3 className="font-semibold">{tag.name}</h3><span className="text-xs font-semibold text-brand">{getResourcesByTag(tag.id).length}</span></div><p className="mt-2 text-sm leading-6 text-slate-600">{tag.description}</p></Link>)}</div></section>;
        })}
      </div>
    </main>
  );
}
