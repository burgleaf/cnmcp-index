"use client";

import { useEffect, useState } from "react";

import {
  DISCOVERY_KINDS,
  DISCOVERY_SORTS,
  loadDiscoveryList,
  type DiscoveryItem,
  type DiscoveryKind,
  type DiscoverySort,
} from "@/lib/discovery-client";

import { EmptyState } from "./empty-state";

const KIND_LABELS: Readonly<Record<DiscoveryKind, string>> = {
  mcp: "MCP",
  skill: "Skill",
  plugin: "AI 编程插件",
};

const SORT_LABELS: Readonly<Record<DiscoverySort, string>> = {
  score: "综合热度",
  stars: "Star 数",
  recent: "最近更新",
};

const PLATFORM_LABELS: Readonly<Record<string, string>> = {
  codex: "Codex",
  "claude-code": "Claude Code",
  deepseek: "DeepSeek",
};

const PAGE_SIZE = 30;

function mergeItems(current: ReadonlyArray<DiscoveryItem>, incoming: ReadonlyArray<DiscoveryItem>): DiscoveryItem[] {
  const seen = new Set(current.map((item) => item.repoFullName));
  return [...current, ...incoming.filter((item) => !seen.has(item.repoFullName))];
}

function formatGeneratedAt(generatedAt: number): string | null {
  if (generatedAt <= 0) return null;
  return new Date(generatedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
}

export function DiscoveryGallery() {
  const [kind, setKind] = useState<DiscoveryKind | "">("");
  const [sort, setSort] = useState<DiscoverySort>("score");
  const [items, setItems] = useState<ReadonlyArray<DiscoveryItem>>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setItems([]);
    setNextCursor(null);
    loadDiscoveryList({ kind, sort, limit: PAGE_SIZE })
      .then((list) => {
        if (!active) return;
        setItems(list.items);
        setNextCursor(list.nextCursor);
        setGeneratedAt(list.generatedAt);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setItems([]);
        setNextCursor(null);
        setGeneratedAt(0);
        setError(reason instanceof Error ? reason.message : "发现服务暂时不可用");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [kind, sort, retry]);

  async function loadMore(): Promise<void> {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const list = await loadDiscoveryList({ kind, sort, limit: PAGE_SIZE, cursor: nextCursor });
      setItems((current) => mergeItems(current, list.items));
      setNextCursor(list.nextCursor);
      setGeneratedAt(list.generatedAt);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "发现服务暂时不可用");
    } finally {
      setLoadingMore(false);
    }
  }

  if (error) {
    return (
      <EmptyState
        title="发现列表暂时无法加载"
        description={`${error}。正式 Catalog 与已打开的静态页面不受影响。`}
        action={
          <button
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            onClick={() => setRetry((value) => value + 1)}
            type="button"
          >
            重新加载
          </button>
        }
      />
    );
  }

  const generatedLabel = formatGeneratedAt(generatedAt);

  return (
    <div>
      <section aria-label="发现筛选" className="mb-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">
            类型
            <select
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-ink outline-none focus:border-brand focus:ring-2 focus:ring-blue-100"
              onChange={(event) => setKind(event.target.value as DiscoveryKind | "")}
              value={kind}
            >
              <option value="">全部</option>
              {DISCOVERY_KINDS.map((value) => (
                <option key={value} value={value}>
                  {KIND_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            排序
            <select
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-ink outline-none focus:border-brand focus:ring-2 focus:ring-blue-100"
              onChange={(event) => setSort(event.target.value as DiscoverySort)}
              value={sort}
            >
              {DISCOVERY_SORTS.map((value) => (
                <option key={value} value={value}>
                  {SORT_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
        </div>
        {generatedLabel ? <p className="mt-4 text-xs text-slate-500">快照生成于 {generatedLabel}</p> : null}
      </section>

      {loading ? (
        <p className="text-sm text-slate-500">正在加载 GitHub 热度发现列表…</p>
      ) : items.length === 0 ? (
        <EmptyState
          title="暂无发现候选"
          description="当前没有可展示的 MCP、Skill 或插件候选。定时爬取完成后会显示在这里；正式 Catalog 仍只包含审核通过的资源。"
        />
      ) : (
        <>
          <ul className="grid gap-5 md:grid-cols-2">
            {items.map((item) => (
              <li key={item.repoFullName}>
                <article className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-brand">
                      {KIND_LABELS[item.kind]}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                      {item.stars.toLocaleString("zh-CN")} stars
                    </span>
                    {item.catalogId ? (
                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">已收录</span>
                    ) : null}
                  </div>
                  <h3 className="mt-4 text-xl font-semibold text-ink">{item.name}</h3>
                  <p className="mt-2 flex-1 text-sm leading-6 text-slate-600">{item.description || "暂无简介"}</p>
                  {item.inferredPlatforms.length > 0 ? (
                    <ul aria-label="推断平台" className="mt-4 flex flex-wrap gap-2">
                      {item.inferredPlatforms.map((platform) => (
                        <li className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700" key={platform}>
                          {PLATFORM_LABELS[platform] ?? platform}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="mt-5 flex flex-wrap gap-3 text-sm font-semibold">
                    <a
                      className="text-brand hover:underline"
                      href={item.htmlUrl}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      查看 GitHub
                    </a>
                    {item.catalogId ? (
                      <a className="text-slate-700 hover:text-brand" href={`/resources/${item.catalogId}`}>
                        打开正式条目
                      </a>
                    ) : null}
                  </div>
                </article>
              </li>
            ))}
          </ul>
          {nextCursor ? (
            <div className="mt-8 text-center">
              <button
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:border-brand hover:text-brand disabled:opacity-60"
                disabled={loadingMore}
                onClick={() => {
                  void loadMore();
                }}
                type="button"
              >
                {loadingMore ? "正在加载…" : "加载更多"}
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
