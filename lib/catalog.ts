import generatedCatalogJson from "@/.generated/resources.generated.json";

import type {
  GeneratedCatalog,
  Platform,
  Resource,
  ResourceKind,
  Tag,
} from "./catalog-types";

export type CatalogAccess = Readonly<{
  getAllResources: () => ReadonlyArray<Resource>;
  getResourceById: (id: string) => Resource | null;
  getAllPlatforms: () => ReadonlyArray<Platform>;
  getEnabledPlatforms: () => ReadonlyArray<Platform>;
  getAllTags: () => ReadonlyArray<Tag>;
  getUsedTags: () => ReadonlyArray<Tag>;
  getResourcesByKind: (kind: ResourceKind) => ReadonlyArray<Resource>;
  getResourcesByPlatform: (platformId: string) => ReadonlyArray<Resource>;
  getResourcesByTag: (tag: string) => ReadonlyArray<Resource>;
}>;

function isPublic(resource: Resource): boolean {
  return (resource.visibility ?? "public") === "public";
}

function comparePlatforms(left: Platform, right: Platform): number {
  return left.sortOrder - right.sortOrder || left.id.localeCompare(right.id);
}

export function createCatalogAccess(catalog: GeneratedCatalog): CatalogAccess {
  const publicResources = catalog.resources.filter(isPublic);
  const resourcesById = new Map(publicResources.map((resource) => [resource.id, resource]));
  const platforms = [...catalog.platforms].sort(comparePlatforms);
  const tags = [...catalog.tags].sort((left, right) => left.id.localeCompare(right.id));

  const resourcesForIds = (ids: ReadonlyArray<string> | undefined): ReadonlyArray<Resource> =>
    (ids ?? []).flatMap((id) => {
      const resource = resourcesById.get(id);
      return resource ? [resource] : [];
    });

  return Object.freeze({
    getAllResources: () => publicResources,
    getResourceById: (id) => resourcesById.get(id) ?? null,
    getAllPlatforms: () => platforms,
    getEnabledPlatforms: () => platforms.filter((platform) => platform.enabled),
    getAllTags: () => tags,
    getUsedTags: () => tags.filter((tag) => resourcesForIds(catalog.indexes.tags[tag.id]).length > 0),
    getResourcesByKind: (kind) => resourcesForIds(catalog.indexes.kinds[kind]),
    getResourcesByPlatform: (platformId) => resourcesForIds(catalog.indexes.platforms[platformId]),
    getResourcesByTag: (tag) => resourcesForIds(catalog.indexes.tags[tag]),
  });
}

const catalog = createCatalogAccess(generatedCatalogJson as unknown as GeneratedCatalog);

export const getAllResources = catalog.getAllResources;
export const getResourceById = catalog.getResourceById;
export const getAllPlatforms = catalog.getAllPlatforms;
export const getEnabledPlatforms = catalog.getEnabledPlatforms;
export const getAllTags = catalog.getAllTags;
export const getUsedTags = catalog.getUsedTags;
export const getResourcesByKind = catalog.getResourcesByKind;
export const getResourcesByPlatform = catalog.getResourcesByPlatform;
export const getResourcesByTag = catalog.getResourcesByTag;
