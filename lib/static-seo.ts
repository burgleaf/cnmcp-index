import type { MetadataRoute } from "next";

import {
  RESOURCE_KINDS,
  type Platform,
  type Resource,
  type Tag,
} from "./catalog-types";
import { PRODUCTION_SITE_URL } from "./env";
import { EMPTY_TAG_ROUTE_SENTINEL } from "./static-params";

function siteUrl(pathname: string): string {
  return new URL(pathname, `${PRODUCTION_SITE_URL}/`).toString();
}

export function createSitemapEntries(input: Readonly<{
  resources: ReadonlyArray<Resource>;
  platforms: ReadonlyArray<Platform>;
  tags: ReadonlyArray<Tag>;
}>): MetadataRoute.Sitemap {
  const fixedEntries: MetadataRoute.Sitemap = ["/", "/resources/", "/submit/"].map(
    (pathname) => ({ url: siteUrl(pathname) }),
  );
  const categoryEntries: MetadataRoute.Sitemap = RESOURCE_KINDS.map((kind) => ({
    url: siteUrl(`/category/${kind}/`),
  }));
  const platformEntries: MetadataRoute.Sitemap = input.platforms
    .filter((platform) => platform.enabled)
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id))
    .map((platform) => ({ url: siteUrl(`/platform/${encodeURIComponent(platform.id)}/`) }));
  const tagEntries: MetadataRoute.Sitemap = input.tags
    .filter((tag) => tag.id !== EMPTY_TAG_ROUTE_SENTINEL)
    .slice()
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((tag) => ({ url: siteUrl(`/tags/${encodeURIComponent(tag.id)}/`) }));
  const resourceEntries: MetadataRoute.Sitemap = input.resources
    .filter((resource) => (resource.visibility ?? "public") === "public")
    .slice()
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((resource) => ({
      url: siteUrl(`/resources/${encodeURIComponent(resource.id)}/`),
      lastModified: resource.updatedAt ?? resource.createdAt,
    }));

  return [
    ...fixedEntries,
    ...categoryEntries,
    ...platformEntries,
    ...tagEntries,
    ...resourceEntries,
  ];
}

export function createRobots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    host: PRODUCTION_SITE_URL,
    sitemap: `${PRODUCTION_SITE_URL}/sitemap.xml`,
  };
}
