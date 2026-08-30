import platformsRegistry from "@/catalog/platforms.json";
import type { ClientCatalog, Platform, Resource, ResourceSummary } from "@/lib/catalog-types";

import mcpSource from "./full-acceptance/resources/acceptance-mcp/resource.json";
import pluginSource from "./full-acceptance/resources/acceptance-plugin/resource.json";
import skillSource from "./full-acceptance/resources/acceptance-skill/resource.json";

const sources = [mcpSource, skillSource, pluginSource] as const;

function toResource(source: (typeof sources)[number]): Resource {
  const featured = "featured" in source ? source.featured : false;
  const preview = "preview" in source ? source.preview : undefined;
  return {
    ...source,
    featured,
    ...(preview ? { preview: `/resource-assets/${source.id}/${preview}` } : {}),
  } as Resource;
}

function toSummary(resource: Resource): ResourceSummary {
  return {
    id: resource.id,
    kind: resource.kind,
    name: resource.name,
    nameEn: resource.nameEn ?? resource.name,
    summary: resource.summary,
    summaryEn: resource.summaryEn ?? resource.summary,
    authorName: resource.author.name,
    tags: resource.tags,
    platforms: resource.compatibility.map((entry) => ({ id: entry.platform, status: entry.status })),
    createdAt: resource.createdAt,
    featured: resource.featured,
  };
}

export const fullAcceptancePlatforms = platformsRegistry.platforms as ReadonlyArray<Platform>;
export const fullAcceptanceResources = sources.map(toResource);
export const fullAcceptanceMcp = fullAcceptanceResources.find((resource) => resource.id === "acceptance-mcp")!;
export const fullAcceptanceCatalog: ClientCatalog = {
  schemaVersion: 1,
  resources: fullAcceptanceResources.map(toSummary),
  indexes: {
    kinds: {
      mcp: ["acceptance-mcp"],
      skill: ["acceptance-skill"],
      plugin: ["acceptance-plugin"],
    },
    platforms: {
      codex: ["acceptance-mcp", "acceptance-skill", "acceptance-plugin"],
      "claude-code": ["acceptance-mcp", "acceptance-skill", "acceptance-plugin"],
    },
    tags: {
      context: ["acceptance-mcp"],
      documentation: ["acceptance-skill"],
      productivity: ["acceptance-plugin"],
      testing: ["acceptance-mcp", "acceptance-skill", "acceptance-plugin"],
    },
  },
};
