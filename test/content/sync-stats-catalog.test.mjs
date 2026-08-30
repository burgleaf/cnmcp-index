import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createCatalogSyncSql,
  getPublicResourceIds,
  runWranglerCatalogSync,
} from "../../scripts/sync-stats-catalog.mjs";

const catalog = {
  schemaVersion: 1,
  resources: [
    { id: "public-two", visibility: "public" },
    { id: "removed-one", visibility: "removed" },
    { id: "public-one" },
  ],
};

test("同步 SQL 只包含公开资源并通过单条原子触发器调用完成", () => {
  assert.deepEqual(getPublicResourceIds(catalog), ["public-one", "public-two"]);
  const sql = createCatalogSyncSql(catalog, 1234);
  assert.match(sql, /^INSERT INTO resource_catalog_sync/);
  assert.match(sql, /public-one/);
  assert.match(sql, /public-two/);
  assert.doesNotMatch(sql, /BEGIN|COMMIT/);
  assert.equal((sql.match(/;/g) ?? []).length, 1);
  assert.doesNotMatch(sql, /removed-one/);
});

test("同步逻辑拒绝未经校验的 ID 和重复 ID", () => {
  assert.throws(
    () => createCatalogSyncSql({ schemaVersion: 1, resources: [{ id: "unsafe'); DROP TABLE x;--" }] }),
    /资源 ID/,
  );
  assert.throws(
    () => createCatalogSyncSql({ schemaVersion: 1, resources: [{ id: "same-id" }, { id: "same-id" }] }),
    /重复/,
  );
});

test("Wrangler 边界使用参数数组、默认 local 且清理临时 SQL", async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "cnmcp-sync-test-"));
  const catalogPath = path.join(projectRoot, "catalog.json");
  await mkdir(path.join(projectRoot, "worker", "node_modules", "wrangler", "bin"), { recursive: true });
  await writeFile(catalogPath, JSON.stringify(catalog));
  let invocation;
  try {
    const result = await runWranglerCatalogSync({
      projectRoot,
      catalogPath,
      syncedAt: 1234,
      runner: async (command, args, options) => {
        invocation = { command, args: [...args], options };
        const sqlPath = args[args.indexOf("--file") + 1];
        assert.match(await readFile(sqlPath, "utf8"), /public-one/);
      },
    });
    assert.deepEqual(result, { resourceCount: 2, mode: "local" });
    assert.equal(invocation.command, process.execPath);
    assert.equal(invocation.args.includes("--local"), true);
    assert.equal(invocation.args.includes("--remote"), false);
    assert.equal(invocation.options.cwd, path.join(projectRoot, "worker"));
    const sqlPath = invocation.args[invocation.args.indexOf("--file") + 1];
    await assert.rejects(readFile(sqlPath, "utf8"), /ENOENT/);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});
