import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CollectionPage } from "@/components/collection-page";
import { getEnabledPlatforms, getResourcesByPlatform } from "@/lib/catalog";
import { createPlatformStaticParams } from "@/lib/static-params";

export const dynamicParams = false;

export function generateStaticParams() {
  return createPlatformStaticParams(getEnabledPlatforms());
}

export async function generateMetadata({ params }: Readonly<{ params: Promise<{ platform: string }> }>): Promise<Metadata> {
  const { platform: platformId } = await params;
  const platform = getEnabledPlatforms().find((entry) => entry.id === platformId);
  return { title: platform ? `${platform.name} 资源` : "平台资源" };
}

export default async function PlatformPage({ params }: Readonly<{ params: Promise<{ platform: string }> }>) {
  const { platform: platformId } = await params;
  const platforms = getEnabledPlatforms();
  const platform = platforms.find((entry) => entry.id === platformId);
  if (!platform) notFound();
  return <CollectionPage description={`浏览声明兼容 ${platform.name} 的 MCP、Skill 与 AI 编程工具插件。兼容状态以各资源标记为准。`} eyebrow="平台目录" platforms={platforms} resources={getResourcesByPlatform(platform.id)} title={`${platform.name} 资源`} />;
}
