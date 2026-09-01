import type { ClientCatalog, ResourceKind, ResourceSummary } from "./catalog-types";

export type CatalogSort = "quality" | "stars" | "active" | "name";

export type CatalogFilters = Readonly<{
  keyword: string;
  kind: ResourceKind | "";
  tag: string;
  sort: CatalogSort;
}>;

export const DEFAULT_CATALOG_FILTERS: CatalogFilters = Object.freeze({
  keyword: "",
  kind: "",
  tag: "",
  sort: "quality",
});

export function normalizeSearchText(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

function searchableText(resource: ResourceSummary): string {
  return normalizeSearchText(
    [
      resource.name,
      resource.nameEn,
      resource.summary,
      resource.summaryEn,
      resource.authorName,
      ...resource.tags,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function score(resource: ResourceSummary): number { return resource.quality?.score ?? 0; }
function stars(resource: ResourceSummary): number { return resource.quality?.stars ?? 0; }
function pushedAt(resource: ResourceSummary): string { return resource.quality?.pushedAt ?? ""; }

export function filterAndSortResources(
  resources: ReadonlyArray<ResourceSummary>,
  filters: CatalogFilters,
): ReadonlyArray<ResourceSummary> {
  const keyword = normalizeSearchText(filters.keyword);
  const filtered = resources.filter((resource) => {
    if (keyword && !(resource.normalizedSearchText ?? searchableText(resource)).includes(keyword)) return false;
    if (filters.kind && resource.kind !== filters.kind) return false;
    if (filters.tag && !resource.tags.includes(filters.tag)) return false;

    return true;
  });

  return [...filtered].sort((left, right) => {
    if (filters.sort === "name") {
      return (
        compareText(normalizeSearchText(left.name), normalizeSearchText(right.name)) ||
        compareText(left.id, right.id)
      );
    }
    if (filters.sort === "stars") {
      return stars(right) - stars(left) || score(right) - score(left) || compareText(left.id, right.id);
    }
    if (filters.sort === "active") {
      return compareText(pushedAt(right), pushedAt(left)) || score(right) - score(left) || compareText(left.id, right.id);
    }
    return score(right) - score(left) || compareText(pushedAt(right), pushedAt(left)) || compareText(left.id, right.id);
  });
}

export function hasActiveFilters(filters: CatalogFilters): boolean {
  return Boolean(filters.keyword || filters.kind || filters.tag);
}

export async function fetchClientCatalog(
  fetcher: typeof fetch = fetch,
): Promise<ClientCatalog> {
  const response = await fetcher("/catalog.json", { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Catalog 加载失败（HTTP ${response.status}）`);
  const catalog = (await response.json()) as Partial<ClientCatalog>;
  if (catalog.schemaVersion !== 1 || !Array.isArray(catalog.resources) || !catalog.indexes) {
    throw new Error("Catalog 数据格式无效");
  }
  return catalog as ClientCatalog;
}
