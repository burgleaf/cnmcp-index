import type { Metadata } from "next";

import { ResourceDirectoryClient } from "@/components/resource-directory-client";
import { getEnabledPlatforms } from "@/lib/catalog";

export const metadata: Metadata = {
  title: "资源目录",
  description: "在浏览器中搜索、筛选和排序 MCP、Skill 与 AI 编程工具插件。",
};

export default function ResourcesPage() {
  return (
    <main className="mx-auto min-h-[calc(100vh-145px)] max-w-6xl px-6 py-12">
      <header className="mb-8 max-w-3xl">
        <p className="text-sm font-semibold tracking-[0.18em] text-brand">静态资源目录</p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight">发现 AI 扩展资源</h1>
        <p className="mt-4 leading-7 text-slate-600">搜索与筛选全部在浏览器中完成，不依赖搜索服务或运行时内容 API。</p>
      </header>
      <ResourceDirectoryClient platforms={getEnabledPlatforms()} />
    </main>
  );
}
