import type { MetadataRoute } from "next";

import { createRobots } from "@/lib/static-seo";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return createRobots();
}
