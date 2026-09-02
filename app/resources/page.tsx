import type { Metadata } from "next";

import { ResourceDirectoryClient } from "@/components/resource-directory-client";

export const metadata: Metadata = {
  title: "资源目录",
  description: "按用途、职业和任务搜索经过整理的 Skill、MCP 与 Plugin，并按可解释质量排序。",
};

export default function ResourcesPage() {
  return (
    <main className="mx-auto min-h-[calc(100vh-145px)] max-w-6xl px-6 py-12">
      <header className="mb-8 max-w-3xl">
        <p className="text-sm font-semibold tracking-[0.18em] text-brand">资源浏览</p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight">从目标出发，找到合适的 AI 能力</h1>
        <p className="mt-4 leading-7 text-slate-600">输入你要完成的工作，或选择资源类型与常用主题。默认按上游项目质量排序。</p>
      </header>
      <ResourceDirectoryClient />
    </main>
  );
}
