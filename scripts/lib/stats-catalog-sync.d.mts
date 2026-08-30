export type GeneratedCatalog = {
  schemaVersion: number;
  resources: Array<{ id: string; visibility?: "public" | "unlisted" | "removed" }>;
};

export function getPublicResourceIds(catalog: GeneratedCatalog): string[];
export function createCatalogSyncSql(catalog: GeneratedCatalog, syncedAt?: number): string;
