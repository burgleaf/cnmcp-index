import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getEnabledPlatforms } from "@/lib/catalog";
import { createPlatformStaticParams } from "@/lib/static-params";

export const dynamicParams = false;

export function generateStaticParams() {
  return createPlatformStaticParams(getEnabledPlatforms());
}

export async function generateMetadata({ params }: Readonly<{ params: Promise<{ platform: string }> }>): Promise<Metadata> {
  const { platform: platformId } = await params;
  const platform = getEnabledPlatforms().find((entry) => entry.id === platformId);
  return { title: platform ? `${platform.name} 支持说明` : "平台支持说明", robots: { index: false, follow: true }, alternates: { canonical: "/resources/" } };
}

export default async function PlatformPage({ params }: Readonly<{ params: Promise<{ platform: string }> }>) {
  const { platform: platformId } = await params;
  const platforms = getEnabledPlatforms();
  const platform = platforms.find((entry) => entry.id === platformId);
  if (!platform) notFound();
  return (
    <main className="mx-auto grid min-h-[calc(100vh-145px)] max-w-3xl place-items-center px-6 py-20 text-center">
      <div><p className="text-sm font-semibold text-brand">浏览方式已调整</p><h1 className="mt-3 text-4xl font-bold">不再按 {platform.name} 划分资源</h1><p className="mt-4 leading-7 text-slate-600">平台支持只在资源详情页依据原作者证据说明，不影响卡片展示、浏览筛选和质量排序。你可以改为按目标任务或资源类型查找。</p><div className="mt-8 flex flex-wrap justify-center gap-3"><Link className="rounded-lg bg-brand px-5 py-3 text-sm font-semibold text-white" href="/resources">浏览全部资源</Link><Link className="rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700" href="/topics">按使用场景浏览</Link></div></div>
    </main>
  );
}
