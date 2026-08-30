import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CollectionPage } from "@/components/collection-page";
import { getEnabledPlatforms, getResourcesByKind } from "@/lib/catalog";
import { RESOURCE_KINDS, type ResourceKind } from "@/lib/catalog-types";
import { createCategoryStaticParams } from "@/lib/static-params";

const KIND_CONTENT: Readonly<Record<ResourceKind, Readonly<{ title: string; description: string }>>> = {
  mcp: { title: "MCP 资源", description: "发现连接模型与外部工具、数据和服务的 Model Context Protocol 资源。" },
  skill: { title: "Skill 资源", description: "发现面向 AI 编程工作流的可复用技能与操作方法。" },
  plugin: { title: "AI 编程工具插件", description: "发现专用于已注册 AI 编程工具平台的插件。" },
};

export const dynamicParams = false;

export function generateStaticParams() {
  return createCategoryStaticParams();
}

export async function generateMetadata({ params }: Readonly<{ params: Promise<{ kind: string }> }>): Promise<Metadata> {
  const { kind } = await params;
  return { title: kind in KIND_CONTENT ? KIND_CONTENT[kind as ResourceKind].title : "资源分类" };
}

export default async function CategoryPage({ params }: Readonly<{ params: Promise<{ kind: string }> }>) {
  const { kind } = await params;
  if (!RESOURCE_KINDS.includes(kind as ResourceKind)) notFound();
  const resourceKind = kind as ResourceKind;
  const content = KIND_CONTENT[resourceKind];
  return <CollectionPage description={content.description} eyebrow="资源分类" platforms={getEnabledPlatforms()} resources={getResourcesByKind(resourceKind)} title={content.title} />;
}
