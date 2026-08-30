import type { MetadataRoute } from "next";

import {
  getAllResources,
  getEnabledPlatforms,
  getUsedTags,
} from "@/lib/catalog";
import { createSitemapEntries } from "@/lib/static-seo";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return createSitemapEntries({
    resources: getAllResources(),
    platforms: getEnabledPlatforms(),
    tags: getUsedTags(),
  });
}
