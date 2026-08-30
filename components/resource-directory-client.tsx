"use client";

import { useEffect, useMemo, useState } from "react";

import {
  COMPATIBILITY_STATUSES,
  RESOURCE_KINDS,
  type ClientCatalog,
  type CompatibilityStatus,
  type Platform,
  type ResourceKind,
} from "@/lib/catalog-types";
import {
  DEFAULT_CATALOG_FILTERS,
  fetchClientCatalog,
  filterAndSortResources,
  hasActiveFilters,
  type CatalogFilters,
} from "@/lib/catalog-search";

import { EmptyState } from "./empty-state";
import { ResourceGallery } from "./resource-gallery";

const KIND_LABELS: Readonly<Record<ResourceKind, string>> = {
  mcp: "MCP",
  skill: "Skill",
  plugin: "AI 编程插件",
};

const STATUS_LABELS: Readonly<Record<CompatibilityStatus, string>> = {
  native: "原生支持",
  supported: "支持",
  partial: "部分支持",
  unsupported: "不支持",
  unknown: "兼容性未知",
};

export function ResourceDirectoryClient({ platforms }: Readonly<{ platforms: ReadonlyArray<Platform> }>) {
  const [catalog, setCatalog] = useState<ClientCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [filters, setFilters] = useState<CatalogFilters>(DEFAULT_CATALOG_FILTERS);

  useEffect(() => {
    let active = true;
    setError(null);
    fetchClientCatalog()
      .then((nextCatalog) => {
        if (active) setCatalog(nextCatalog);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Catalog 加载失败");
      });
    return () => {
      active = false;
    };
  }, [retry]);

  const resources = useMemo(
    () => filterAndSortResources(catalog?.resources ?? [], filters),
    [catalog, filters],
  );
  const tags = useMemo(
    () => [...new Set((catalog?.resources ?? []).flatMap((resource) => resource.tags))].sort(),
    [catalog],
  );
  const updateFilter = <Key extends keyof CatalogFilters>(key: Key, value: CatalogFilters[Key]) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };
  const clearFilters = () => setFilters(DEFAULT_CATALOG_FILTERS);

  return (
    <div>
      <section aria-label="资源筛选" className="mb-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <label className="text-sm font-medium text-slate-700 lg:col-span-2">
            搜索资源
            <input
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-ink outline-none focus:border-brand focus:ring-2 focus:ring-blue-100"
              onChange={(event) => updateFilter("keyword", event.target.value)}
              placeholder="搜索名称、摘要、作者或标签"
              type="search"
              value={filters.keyword}
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            资源类型
            <select className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2" onChange={(event) => updateFilter("kind", event.target.value as ResourceKind | "")} value={filters.kind}>
              <option value="">全部类型</option>
              {RESOURCE_KINDS.map((kind) => <option key={kind} value={kind}>{KIND_LABELS[kind]}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            平台
            <select className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2" onChange={(event) => updateFilter("platform", event.target.value)} value={filters.platform}>
              <option value="">全部平台</option>
              {platforms.filter((platform) => platform.enabled).map((platform) => <option key={platform.id} value={platform.id}>{platform.name}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            兼容状态
            <select className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2" onChange={(event) => updateFilter("status", event.target.value as CompatibilityStatus | "")} value={filters.status}>
              <option value="">全部状态</option>
              {COMPATIBILITY_STATUSES.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            标签
            <select className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2" onChange={(event) => updateFilter("tag", event.target.value)} value={filters.tag}>
              <option value="">全部标签</option>
              {tags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            排序
            <select className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2" onChange={(event) => updateFilter("sort", event.target.value as CatalogFilters["sort"])} value={filters.sort}>
              <option value="recent">最近收录</option>
              <option value="name">名称</option>
            </select>
          </label>
        </div>
        <div className="mt-4 flex items-center justify-between gap-4 text-sm text-slate-600">
          <p aria-live="polite">{catalog ? `找到 ${resources.length} 个资源` : "正在读取静态目录"}</p>
          {hasActiveFilters(filters) ? (
            <button className="font-semibold text-brand hover:text-blue-700" onClick={clearFilters} type="button">清除筛选</button>
          ) : null}
        </div>
      </section>

      {error ? (
        <EmptyState
          action={<button className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white" onClick={() => setRetry((value) => value + 1)} type="button">重新加载</button>}
          description={`${error}。已打开的静态页面不受影响。`}
          title="资源目录暂时无法加载"
        />
      ) : !catalog ? (
        <EmptyState description="正在从 /catalog.json 读取静态资源目录，不会请求搜索服务。" title="正在加载资源目录" />
      ) : (
        <ResourceGallery
          emptyAction={hasActiveFilters(filters) ? <button className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white" onClick={clearFilters} type="button">清除筛选</button> : undefined}
          emptyDescription={hasActiveFilters(filters) ? "没有资源同时满足当前搜索和筛选条件。" : "正式 Catalog 当前为空，尚无可展示的公开资源。"}
          emptyTitle={hasActiveFilters(filters) ? "没有找到匹配资源" : "暂无公开资源"}
          platforms={platforms}
          resources={resources}
        />
      )}
    </div>
  );
}
