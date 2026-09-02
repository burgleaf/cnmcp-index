import type { Metadata } from "next";

import type { Resource } from "./catalog-types";
import { PRODUCTION_SITE_URL } from "./env";

export const DEFAULT_SOCIAL_IMAGE_PATH = "/images/resource-placeholder.svg";

const KIND_LABELS = {
  mcp: "MCP",
  skill: "Skill",
  plugin: "AI 编程工具插件",
} as const;

function isPublicResource(resource: Resource): boolean {
  return (resource.visibility ?? "public") === "public";
}

function assertPublicResource(resource: Resource): void {
  if (!isPublicResource(resource)) {
    throw new Error(`资源 ${resource.id} 不是公开资源，不得生成 SEO 输出。`);
  }
}

function absoluteSiteUrl(pathname: string): string {
  return new URL(pathname, `${PRODUCTION_SITE_URL}/`).toString();
}

function isReviewedLocalImage(resource: Resource, image: string | undefined): image is string {
  if (!image) return false;
  const escapedId = resource.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `^/resource-assets/${escapedId}/[A-Za-z0-9][A-Za-z0-9._-]*\\.(?:avif|jpe?g|png|webp|svg)$`,
    "i",
  ).test(image);
}

export function getResourceCanonicalUrl(resource: Resource): string {
  assertPublicResource(resource);
  return absoluteSiteUrl(`/resources/${encodeURIComponent(resource.id)}/`);
}

export function getResourceSocialImage(resource: Resource): string {
  assertPublicResource(resource);
  const localImage = [resource.preview, resource.logo].find((image) =>
    isReviewedLocalImage(resource, image),
  );
  return absoluteSiteUrl(localImage ?? DEFAULT_SOCIAL_IMAGE_PATH);
}

export function createResourceMetadata(resource: Resource): Metadata {
  assertPublicResource(resource);
  const kindLabel = KIND_LABELS[resource.kind];
  const title = `${resource.name}（${kindLabel} · ${resource.id}）`;
  const description = `${resource.name}（${resource.id}）— ${resource.summary}`;
  const canonical = getResourceCanonicalUrl(resource);
  const image = getResourceSocialImage(resource);

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "article",
      locale: "zh_CN",
      siteName: "CNMCP AI 扩展社区",
      url: canonical,
      title,
      description,
      images: [{ url: image, alt: `${resource.name} 分享预览图` }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

export function createResourceJsonLd(resource: Resource): Readonly<Record<string, unknown>> {
  assertPublicResource(resource);
  const isSoftware = resource.kind === "mcp" || resource.kind === "plugin";

  return {
    "@context": "https://schema.org",
    "@type": isSoftware ? ["CreativeWork", "SoftwareSourceCode"] : "CreativeWork",
    "@id": getResourceCanonicalUrl(resource),
    url: getResourceCanonicalUrl(resource),
    name: resource.name,
    ...(resource.nameEn && resource.nameEn !== resource.name
      ? { alternateName: resource.nameEn }
      : {}),
    description: resource.summary,
    codeRepository: resource.repository,
    license: resource.license,
    author: {
      "@type": resource.author.url ? "Person" : "Organization",
      name: resource.author.name,
      ...(resource.author.url ? { url: resource.author.url } : {}),
    },
    genre: KIND_LABELS[resource.kind],
    keywords: resource.tags.join(", "),
    image: getResourceSocialImage(resource),
    ...(isSoftware
      ? {
          applicationCategory: "DeveloperApplication",
        }
      : {}),
    additionalProperty: [
      { "@type": "PropertyValue", name: "资源类型", value: resource.kind },
      { "@type": "PropertyValue", name: "综合质量", value: resource.quality?.score ?? "未评分" },
      { "@type": "PropertyValue", name: "GitHub Stars", value: resource.quality?.stars ?? 0 },
    ],
  };
}

export function serializeJsonLd(value: Readonly<Record<string, unknown>>): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
