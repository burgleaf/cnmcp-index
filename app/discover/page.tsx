import type { Metadata } from "next";

import { DiscoveryGallery } from "@/components/discovery-gallery";
import { PRODUCTION_SITE_URL } from "@/lib/env";

export const metadata: Metadata = {
  title: "发现热门扩展",
  description: "查看 GitHub 与官方 MCP Registry 上较热门的 MCP、Skill 与 AI 编程工具插件候选。发现列表未经兼容性与安装核验。",
  alternates: { canonical: `${PRODUCTION_SITE_URL}/discover/` },
};

export default function DiscoverPage() {
  return (
    <main className="mx-auto min-h-[calc(100vh-145px)] max-w-6xl px-6 py-12">
      <header className="mb-8 max-w-3xl">
        <p className="text-sm font-semibold tracking-[0.18em] text-brand">GitHub 热度发现</p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight">发现热门 AI 扩展</h1>
        <p className="mt-4 leading-7 text-slate-600">
          列表来自公开 MCP Registry 与 GitHub Search 的定期抓取，按 star、近期活跃和来源加权排序。发现条目
          <strong className="font-semibold"> 未核验安装命令与平台兼容性</strong>
          ，不能替代审核后的正式 Catalog。
        </p>
      </header>
      <DiscoveryGallery />
    </main>
  );
}
