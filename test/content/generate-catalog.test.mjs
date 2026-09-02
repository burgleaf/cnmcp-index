import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { generateCatalog, normalizeSearchText } from "../../scripts/generate-catalog.mjs";

const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(TEST_DIRECTORY, "../..");
const FIXTURE_ROOT = path.join(PROJECT_ROOT, "test", "fixtures", "content-valid");

async function withFixture(callback) {
  const temporaryParent = await mkdtemp(path.join(os.tmpdir(), "cnmcp-generator-"));
  const projectRoot = path.join(temporaryParent, "project");
  await cp(FIXTURE_ROOT, projectRoot, { recursive: true });
  try {
    return await callback(projectRoot);
  } finally {
    await rm(temporaryParent, { recursive: true, force: true });
  }
}

async function mutateResource(projectRoot, id, mutate) {
  const filePath = path.join(projectRoot, "resources", id, "resource.json");
  const resource = JSON.parse(await readFile(filePath, "utf8"));
  mutate(resource);
  await writeFile(filePath, `${JSON.stringify(resource, null, 2)}\n`, "utf8");
}

test("生成完整 Catalog、反向索引和不含 README/安装命令的客户端 Catalog", async () => {
  await withFixture(async (projectRoot) => {
    const result = await generateCatalog({ projectRoot });
    assert.deepEqual(result.fullCatalog.resources.map(({ id }) => id), ["alpha-mcp", "gamma-plugin", "beta-skill"]);
    assert.deepEqual(result.fullCatalog.indexes.kinds, {
      mcp: ["alpha-mcp"],
      plugin: ["gamma-plugin"],
      skill: ["beta-skill"],
    });
    assert.deepEqual(result.fullCatalog.indexes.platforms, {
      "claude-code": ["alpha-mcp", "gamma-plugin", "beta-skill"],
      codex: ["alpha-mcp", "beta-skill"],
    });
    assert.deepEqual(result.fullCatalog.indexes.tags.context, ["alpha-mcp"]);

    const alphaFull = result.fullCatalog.resources.find(({ id }) => id === "alpha-mcp");
    assert.match(alphaFull.readme, /安全的测试夹具/);
    assert.match(alphaFull.compatibility[0].installations[0].command, /codex mcp add/);

    const clientText = result.publicBytes;
    assert.doesNotMatch(clientText, /"readme"/);
    assert.doesNotMatch(clientText, /"installations"/);
    assert.doesNotMatch(clientText, /codex mcp add/);
    assert.doesNotMatch(clientText, /安全的测试夹具/);
    assert.deepEqual(JSON.parse(await readFile(path.join(projectRoot, "public", "catalog.json"), "utf8")), result.clientCatalog);
  });
});

test("英文缺失时仅回退中文，搜索字段执行 Unicode、小写与空白规范化", async () => {
  await withFixture(async (projectRoot) => {
    const result = await generateCatalog({ projectRoot });
    const beta = result.clientCatalog.resources.find(({ id }) => id === "beta-skill");
    assert.equal(beta.nameEn, beta.name);
    assert.equal(beta.summaryEn, beta.summary);
    assert.match(beta.normalizedSearchText, /贝塔代码审查 skill/);
    assert.match(beta.normalizedSearchText, /cnmcp fixtures/);
    assert.match(beta.normalizedSearchText, /code-quality/);
  });
  assert.equal(normalizeSearchText(["  ＡLPHA\tSkill  ", "作者"]), "alpha skill 作者");
});

test("省略平台兼容性和收录日期的资源仍可生成 Catalog", async () => {
  await withFixture(async (projectRoot) => {
    await mutateResource(projectRoot, "beta-skill", (resource) => {
      delete resource.compatibility;
      delete resource.createdAt;
    });
    const result = await generateCatalog({ projectRoot });
    const beta = result.fullCatalog.resources.find(({ id }) => id === "beta-skill");
    const betaSummary = result.clientCatalog.resources.find(({ id }) => id === "beta-skill");
    assert.deepEqual(beta.compatibility, []);
    assert.deepEqual(betaSummary.platforms, []);
    assert.equal(betaSummary.createdAt, undefined);
    assert.ok(Object.values(result.fullCatalog.indexes.platforms).every((ids) => !ids.includes("beta-skill")));
  });
});

test("相同语义输入在数组顺序变化和重复生成后保持字节确定", async () => {
  await withFixture(async (projectRoot) => {
    const first = await generateCatalog({ projectRoot });
    const second = await generateCatalog({ projectRoot });
    assert.equal(second.generatedBytes, first.generatedBytes);
    assert.equal(second.publicBytes, first.publicBytes);

    await mutateResource(projectRoot, "alpha-mcp", (resource) => {
      resource.tags.reverse();
      resource.compatibility.reverse();
    });
    const permuted = await generateCatalog({ projectRoot });
    assert.equal(permuted.generatedBytes, first.generatedBytes);
    assert.equal(permuted.publicBytes, first.publicBytes);
    assert.equal(await readFile(first.generatedCatalogPath, "utf8"), first.generatedBytes);
    assert.equal(await readFile(first.publicCatalogPath, "utf8"), first.publicBytes);
  });
});

test("非公开资源不会进入完整/客户端 Catalog 和任何反向索引", async () => {
  await withFixture(async (projectRoot) => {
    await mutateResource(projectRoot, "gamma-plugin", (resource) => {
      resource.visibility = "unlisted";
    });
    const result = await generateCatalog({ projectRoot });
    assert.deepEqual(result.fullCatalog.resources.map(({ id }) => id), ["alpha-mcp", "beta-skill"]);
    assert.ok(Object.values(result.fullCatalog.indexes).every((group) =>
      Object.values(group).every((ids) => !ids.includes("gamma-plugin")),
    ));
  });
});

test("受审本地图片被复制并转换为稳定公开路径", async () => {
  await withFixture(async (projectRoot) => {
    await mutateResource(projectRoot, "alpha-mcp", (resource) => {
      resource.logo = "logo.svg";
    });
    const sourceSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><circle cx="4" cy="4" r="3"/></svg>\n';
    await writeFile(path.join(projectRoot, "resources", "alpha-mcp", "logo.svg"), sourceSvg, "utf8");
    const result = await generateCatalog({ projectRoot });
    const alpha = result.clientCatalog.resources.find(({ id }) => id === "alpha-mcp");
    assert.equal(alpha.logo, "/resource-assets/alpha-mcp/logo.svg");
    assert.equal(
      await readFile(path.join(projectRoot, "public", "resource-assets", "alpha-mcp", "logo.svg"), "utf8"),
      sourceSvg,
    );
  });
});
