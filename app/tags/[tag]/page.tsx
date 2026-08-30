import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CollectionPage } from "@/components/collection-page";
import { getEnabledPlatforms, getResourcesByTag, getUsedTags } from "@/lib/catalog";
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
  return { title: tag ? `${tag.name}资源` : "标签资源" };
}

export default async function TagPage({ params }: Readonly<{ params: Promise<{ tag: string }> }>) {
  const { tag: tagId } = await params;
  if (tagId === EMPTY_TAG_ROUTE_SENTINEL) notFound();
  const tag = getUsedTags().find((entry) => entry.id === tagId);
  if (!tag) notFound();
  return <CollectionPage description={`浏览标记为“${tag.name}”的全部公开资源。`} eyebrow="资源标签" platforms={getEnabledPlatforms()} resources={getResourcesByTag(tag.id)} title={`#${tag.name}`} />;
}
