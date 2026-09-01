"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { RESOURCE_KINDS, type ClientCatalog, type ResourceKind } from "@/lib/catalog-types";
import {
  DEFAULT_CATALOG_FILTERS,
  fetchClientCatalog,
  filterAndSortResources,
  hasActiveFilters,
  type CatalogFilters,
} from "@/lib/catalog-search";

import { EmptyState } from "./empty-state";
import { ResourceGallery } from "./resource-gallery";

const KIND_LABELS: Readonly<Record<ResourceKind, string>> = { mcp: "MCP", skill: "Skill", plugin: "插件" };
const SORT_LABELS: Readonly<Record<CatalogFilters["sort"], string>> = {
  quality: "综合质量",
  stars: "Stars 最多",
  active: "最近活跃",
  name: "名称",
};

export function ResourceDirectoryClient() {
  const [catalog, setCatalog] = useState<ClientCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [filters, setFilters] = useState<CatalogFilters>(DEFAULT_CATALOG_FILTERS);

  useEffect(() => {
    const keyword = new URLSearchParams(window.location.search).get("q")?.trim();
    if (keyword) setFilters((current) => ({ ...current, keyword }));
  }, []);

  useEffect(() => {
    let active = true;
    setError(null);
    fetchClientCatalog()
      .then((nextCatalog) => { if (active) setCatalog(nextCatalog); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Catalog 加载失败"); });
    return () => { active = false; };
  }, [retry]);

  const resources = useMemo(() => filterAndSortResources(catalog?.resources ?? [], filters), [catalog, filters]);
  const commonTags = useMemo(() => {
    if (!catalog) return [];
    return (catalog.tags ?? [])
      .filter((tag) => (catalog.indexes.tags[tag.id]?.length ?? 0) > 0)
      .sort((left, right) => (catalog.indexes.tags[right.id]?.length ?? 0) - (catalog.indexes.tags[left.id]?.length ?? 0) || left.sortOrder - right.sortOrder)
      .slice(0, 10);
  }, [catalog]);
  const updateFilter = <Key extends keyof CatalogFilters>(key: Key, value: CatalogFilters[Key]) => setFilters((current) => ({ ...current, [key]: value }));
  const clearFilters = () => setFilters(DEFAULT_CATALOG_FILTERS);

  return (
    <div>
      <section aria-label="资源筛选" className="mb-8 border-y border-slate-200 bg-white py-5">
        <label className="block text-sm font-semibold text-slate-800">
          <span className="sr-only">搜索资源</span>
          <input
            className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-base text-ink outline-none transition focus:border-brand focus:bg-white focus:ring-4 focus:ring-blue-100"
            onChange={(event) => updateFilter("keyword", event.target.value)}
            placeholder="搜索名称、用途、作者，或输入“导演”“绘图”“代码审查”"
            type="search"
            value={filters.keyword}
          />
        </label>

        <div className="mt-5 flex flex-wrap items-center gap-2" aria-label="资源类型">
          <button className={`filter-chip ${filters.kind === "" ? "filter-chip-active" : ""}`} onClick={() => updateFilter("kind", "")} type="button">全部</button>
          {RESOURCE_KINDS.map((kind) => (
            <button className={`filter-chip ${filters.kind === kind ? "filter-chip-active" : ""}`} key={kind} onClick={() => updateFilter("kind", kind)} type="button">{KIND_LABELS[kind]}</button>
          ))}
        </div>

        {commonTags.length ? (
          <div className="mt-4 flex flex-wrap items-center gap-2" aria-label="常用主题">
            <span className="mr-1 text-xs font-semibold text-slate-500">常用主题</span>
            {commonTags.map((tag) => (
              <button className={`filter-chip ${filters.tag === tag.id ? "filter-chip-active" : ""}`} key={tag.id} onClick={() => updateFilter("tag", filters.tag === tag.id ? "" : tag.id)} type="button">{tag.name}</button>
            ))}
            <Link className="px-2 text-sm font-semibold text-brand hover:underline" href="/topics">全部主题</Link>
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-4">
          <p aria-live="polite" className="text-sm text-slate-600">{catalog ? `找到 ${resources.length} 个资源` : "正在读取静态目录"}</p>
          <div className="flex items-center gap-3">
            {hasActiveFilters(filters) ? <button className="text-sm font-semibold text-brand hover:underline" onClick={clearFilters} type="button">清除条件</button> : null}
            <label className="text-sm text-slate-600">排序 <select className="ml-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-ink" onChange={(event) => updateFilter("sort", event.target.value as CatalogFilters["sort"])} value={filters.sort}>{Object.entries(SORT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          </div>
        </div>
      </section>

      {error ? (
        <EmptyState action={<button className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white" onClick={() => setRetry((value) => value + 1)} type="button">重新加载</button>} description={`${error}。已打开的静态页面不受影响。`} title="资源目录暂时无法加载" />
      ) : !catalog ? (
        <EmptyState description="正在从静态目录读取资源，不依赖搜索服务。" title="正在加载资源目录" />
      ) : (
        <ResourceGallery
          emptyAction={hasActiveFilters(filters) ? <button className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white" onClick={clearFilters} type="button">清除条件</button> : undefined}
          emptyDescription={hasActiveFilters(filters) ? "没有资源同时满足当前搜索和主题条件。" : "正式目录当前为空。"}
          emptyTitle={hasActiveFilters(filters) ? "没有找到匹配资源" : "暂无公开资源"}
          resources={resources}
        />
      )}
    </div>
  );
}
