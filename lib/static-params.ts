import { RESOURCE_KINDS, type Platform, type Resource, type Tag } from "./catalog-types";

export function createResourceStaticParams(resources: ReadonlyArray<Resource>) {
  return resources
    .filter((resource) => (resource.visibility ?? "public") === "public")
    .map((resource) => ({ id: resource.id }));
}

export function createCategoryStaticParams() {
  return RESOURCE_KINDS.map((kind) => ({ kind }));
}

export function createPlatformStaticParams(platforms: ReadonlyArray<Platform>) {
  return platforms.filter((platform) => platform.enabled).map((platform) => ({ platform: platform.id }));
}

export const EMPTY_TAG_ROUTE_SENTINEL = "__empty-catalog__";

export function createTagStaticParams(tags: ReadonlyArray<Tag>) {
  return tags.map((tag) => ({ tag: tag.id }));
}

export function createExportSafeTagStaticParams(tags: ReadonlyArray<Tag>) {
  const params = createTagStaticParams(tags);
  return params.length > 0 ? params : [{ tag: EMPTY_TAG_ROUTE_SENTINEL }];
}
