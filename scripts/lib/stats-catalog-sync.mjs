const RESOURCE_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,78}[a-z0-9])$/;

function sqlText(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

export function getPublicResourceIds(catalog) {
  if (!catalog || typeof catalog !== "object" || catalog.schemaVersion !== 1 || !Array.isArray(catalog.resources)) {
    throw new Error("Catalog 格式无效：需要 schemaVersion=1 和 resources 数组。");
  }
  const ids = catalog.resources
    .filter((resource) => resource && typeof resource === "object" && (resource.visibility ?? "public") === "public")
    .map((resource) => resource.id);
  if (ids.some((id) => typeof id !== "string" || !RESOURCE_ID_PATTERN.test(id))) {
    throw new Error("Catalog 包含未通过资源 ID 校验的公开资源。");
  }
  if (new Set(ids).size !== ids.length) throw new Error("Catalog 包含重复的公开资源 ID。");
  return ids.slice().sort();
}

export function createCatalogSyncSql(catalog, syncedAt = Date.now()) {
  if (!Number.isSafeInteger(syncedAt) || syncedAt < 0) throw new Error("同步时间必须是非负安全整数。");
  const ids = getPublicResourceIds(catalog);
  const resourceIdsJson = JSON.stringify(ids);
  return `INSERT INTO resource_catalog_sync (resource_ids_json, synced_at) VALUES (${sqlText(resourceIdsJson)}, ${syncedAt});\n`;
}
