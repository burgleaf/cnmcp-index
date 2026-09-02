import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CollectionPage } from "@/components/collection-page";
import { getResourcesByKind } from "@/lib/catalog";
import { RESOURCE_KINDS, type ResourceKind } from "@/lib/catalog-types";
import { PRODUCTION_SITE_URL } from "@/lib/env";
import { createCategoryStaticParams } from "@/lib/static-params";

const KIND_CONTENT: Readonly<Record<ResourceKind, Readonly<{ title: string; description: string }>>> = {
  mcp: { title: "MCP 资源", description: "发现连接模型与外部工具、数据和服务的 Model Context Protocol 资源。" },
  skill: { title: "Skill 资源", description: "发现面向 AI 编程工作流的可复用技能与操作方法。" },
  plugin: { title: "Plugin 资源", description: "发现为 AI 工具增加工作流、工具或界面能力的插件。" },
};

export const dynamicParams = false;

export function generateStaticParams() {
  return createCategoryStaticParams();
}

export async function generateMetadata({ params }: Readonly<{ params: Promise<{ kind: string }> }>): Promise<Metadata> {
  const { kind } = await params;
  const content = KIND_CONTENT[kind as ResourceKind];
  return content ? { title: content.title, description: content.description, alternates: { canonical: `${PRODUCTION_SITE_URL}/category/${kind}/` } } : { title: "资源分类" };
}

export default async function CategoryPage({ params }: Readonly<{ params: Promise<{ kind: string }> }>) {
  const { kind } = await params;
  if (!RESOURCE_KINDS.includes(kind as ResourceKind)) notFound();
  const resourceKind = kind as ResourceKind;
  const content = KIND_CONTENT[resourceKind];
  return <CollectionPage description={content.description} eyebrow="资源分类" resources={getResourcesByKind(resourceKind)} title={content.title} />;
}
