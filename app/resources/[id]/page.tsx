import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ResourceDetail } from "@/components/resource-detail";
import { getAllPlatforms, getAllResources, getResourceById } from "@/lib/catalog";
import {
  createResourceJsonLd,
  createResourceMetadata,
  serializeJsonLd,
} from "@/lib/resource-seo";
import { createResourceStaticParams } from "@/lib/static-params";

export const dynamicParams = false;
// Next 静态导出在正式 Catalog 为空时仍需识别该路由为纯静态；空参数集不生成伪资源页面。
export const dynamic = "force-static";

export function generateStaticParams() {
  return createResourceStaticParams(getAllResources());
}

export async function generateMetadata({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>): Promise<Metadata> {
  const { id } = await params;
  const resource = getResourceById(id);
  if (!resource) notFound();
  return createResourceMetadata(resource);
}

export default async function ResourceDetailPage({
  params,
}: Readonly<{
  params: Promise<{ id: string }>;
}>) {
  const { id } = await params;
  const resource = getResourceById(id);
  if (!resource) notFound();
  const platforms = getAllPlatforms();
  const jsonLd = createResourceJsonLd(resource, platforms);

  return (
    <>
      <script
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
        type="application/ld+json"
      />
      <ResourceDetail platforms={platforms} resource={resource} />
    </>
  );
}
