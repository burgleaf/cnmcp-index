import type {
  ClientCatalog,
  CompatibilityStatus,
  ResourceKind,
  ResourceSummary,
} from "./catalog-types";

export type CatalogSort = "recent" | "name";

export type CatalogFilters = Readonly<{
  keyword: string;
  kind: ResourceKind | "";
  platform: string;
  status: CompatibilityStatus | "";
  tag: string;
  sort: CatalogSort;
}>;

export const DEFAULT_CATALOG_FILTERS: CatalogFilters = Object.freeze({
  keyword: "",
  kind: "",
  platform: "",
  status: "",
  tag: "",
  sort: "recent",
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

export function filterAndSortResources(
  resources: ReadonlyArray<ResourceSummary>,
  filters: CatalogFilters,
): ReadonlyArray<ResourceSummary> {
  const keyword = normalizeSearchText(filters.keyword);
  const filtered = resources.filter((resource) => {
    if (keyword && !(resource.normalizedSearchText ?? searchableText(resource)).includes(keyword)) return false;
    if (filters.kind && resource.kind !== filters.kind) return false;
    if (filters.tag && !resource.tags.includes(filters.tag)) return false;

    if (filters.platform || filters.status) {
      const matchesCompatibility = resource.platforms.some(
        (entry) =>
          (!filters.platform || entry.id === filters.platform) &&
          (!filters.status || entry.status === filters.status),
      );
      if (!matchesCompatibility) return false;
    }

    return true;
  });

  return [...filtered].sort((left, right) => {
    if (filters.sort === "name") {
      return (
        compareText(normalizeSearchText(left.name), normalizeSearchText(right.name)) ||
        compareText(left.id, right.id)
      );
    }
    return compareText(right.createdAt, left.createdAt) || compareText(left.id, right.id);
  });
}

export function hasActiveFilters(filters: CatalogFilters): boolean {
  return Boolean(filters.keyword || filters.kind || filters.platform || filters.status || filters.tag);
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
