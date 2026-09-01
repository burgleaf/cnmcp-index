import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CollectionPage } from "@/components/collection-page";
import { getResourcesByTag, getUsedTags } from "@/lib/catalog";
import { PRODUCTION_SITE_URL } from "@/lib/env";
import { createExportSafeTagStaticParams, EMPTY_TAG_ROUTE_SENTINEL } from "@/lib/static-params";

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return createExportSafeTagStaticParams(getUsedTags());
}

export async function generateMetadata({ params }: Readonly<{ params: Promise<{ tag: string }> }>): Promise<Metadata> {
  const { tag: tagId } = await params;
  if (tagId === EMPTY_TAG_ROUTE_SENTINEL) notFound();
  const tag = getUsedTags().find((entry) => entry.id === tagId);
  return tag ? { title: `${tag.name} AI 资源`, description: `${tag.description} 浏览相关 MCP、Skill 与插件，并按上游质量排序。`, alternates: { canonical: `${PRODUCTION_SITE_URL}/tags/${tag.id}/` } } : { title: "主题资源" };
}

export default async function TagPage({ params }: Readonly<{ params: Promise<{ tag: string }> }>) {
  const { tag: tagId } = await params;
  if (tagId === EMPTY_TAG_ROUTE_SENTINEL) notFound();
  const tag = getUsedTags().find((entry) => entry.id === tagId);
  if (!tag) notFound();
  return <CollectionPage description={`${tag.description} 以下结果默认按 Stars、活跃度、采用度、资料完整度和编辑审核综合排序。`} eyebrow={tag.group === "profession" ? "适合谁" : tag.group === "task" ? "目标任务" : "资源主题"} resources={getResourcesByTag(tag.id)} title={tag.name} />;
}
