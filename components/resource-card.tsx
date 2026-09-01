import Link from "next/link";

import type { ResourceKind, ResourceQuality } from "@/lib/catalog-types";

import { TagLink } from "./tag-link";

const KIND_LABELS: Readonly<Record<ResourceKind, string>> = {
  mcp: "MCP",
  skill: "Skill",
  plugin: "AI 编程插件",
};

type CardResource = Readonly<{
  id: string;
  kind: ResourceKind;
  name: string;
  summary: string;
  tags: ReadonlyArray<string>;
  createdAt: string;
  featured: boolean;
  quality?: ResourceQuality;
}>;

export function ResourceCard({
  resource,
}: Readonly<{
  resource: CardResource;
}>) {
  return (
    <article className="group flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-brand">
          {KIND_LABELS[resource.kind]}
        </span>
        {resource.featured ? (
          <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">精选</span>
        ) : null}
      </div>
      <h3 className="mt-4 text-xl font-semibold text-ink">
        <Link className="rounded-sm hover:text-brand focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2" href={`/resources/${resource.id}`}>
          {resource.name}
        </Link>
      </h3>
      <p className="mt-2 flex-1 text-sm leading-6 text-slate-600">{resource.summary}</p>
      <ul aria-label="资源标签" className="mt-4 flex flex-wrap gap-2">
        {resource.tags.slice(0, 4).map((tag) => (
          <li key={tag}><TagLink compact tagId={tag} /></li>
        ))}
      </ul>
      <div className="mt-5 border-t border-slate-100 pt-4 text-xs text-slate-500">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p><span className="font-semibold text-ink">综合质量 {resource.quality?.score ?? "—"}</span><span className="mx-2">·</span>{(resource.quality?.stars ?? 0).toLocaleString("zh-CN")} Stars</p>
          <Link className="font-semibold text-brand" href={`/resources/${resource.id}`}>查看详情 →</Link>
        </div>
      </div>
    </article>
  );
}
