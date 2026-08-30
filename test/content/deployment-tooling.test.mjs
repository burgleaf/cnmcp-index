import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createBuildSummary, generateBuildSummary } from "../../scripts/ci-build-summary.mjs";
import { assertHashSaltSecret, validateDeploymentEnvironment } from "../../scripts/check-cloudflare-prerequisites.mjs";
import { extractPagesDeploymentUrl } from "../../scripts/extract-pages-deployment-url.mjs";
import { createProductionWranglerConfig, prepareWranglerConfig } from "../../scripts/prepare-wrangler-config.mjs";
import { createPagesSmokePaths } from "../../scripts/smoke-deployment.mjs";
import { requiresWorkerDeployment } from "../../scripts/wait-worker-deployment.mjs";

const databaseId = "01234567-89ab-cdef-0123-456789abcdef";
const baseEnvironment = {
  CLOUDFLARE_ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
  CLOUDFLARE_D1_DATABASE_ID: databaseId,
  CLOUDFLARE_API_TOKEN: "test-only-token",
  WORKER_API_URL: "https://api.cnmcp.com",
  PRODUCTION_SITE_URL: "https://www.cnmcp.com",
  CLOUDFLARE_PAGES_PROJECT: "cnmcp-community",
};

test("部署前置检查拒绝缺失、注入式项目名和非 HTTPS URL，且接受合法配置", () => {
  assert.doesNotThrow(() => validateDeploymentEnvironment("worker", baseEnvironment));
  assert.doesNotThrow(() => validateDeploymentEnvironment("pages", baseEnvironment));
  assert.throws(() => validateDeploymentEnvironment("pages", { ...baseEnvironment, CLOUDFLARE_PAGES_PROJECT: "name; rm" }), /格式/);
  assert.throws(() => validateDeploymentEnvironment("worker", { ...baseEnvironment, WORKER_API_URL: "http://api.cnmcp.com" }), /HTTPS/);
  assert.throws(() => validateDeploymentEnvironment("worker", { ...baseEnvironment, CLOUDFLARE_API_TOKEN: "" }), /缺少/);
});

test("临时 Wrangler 配置只替换 DB ID 且输出限制在 RUNNER_TEMP", async () => {
  const config = { name: "worker", d1_databases: [{ binding: "DB", database_id: "placeholder" }] };
  assert.equal(createProductionWranglerConfig(config, databaseId).d1_databases[0].database_id, databaseId);
  assert.throws(() => createProductionWranglerConfig(config, "$(unsafe)"), /格式/);

  const temp = await mkdtemp(path.join(os.tmpdir(), "cnmcp-config-"));
  const inputPath = path.join(temp, "input.json");
  const outputPath = path.join(temp, "generated", "production.json");
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(inputPath, JSON.stringify(config));
  try {
    await prepareWranglerConfig({ inputPath, databaseId, outputPath, runnerTemp: temp });
    assert.equal(JSON.parse(await readFile(outputPath, "utf8")).d1_databases[0].database_id, databaseId);
    await assert.rejects(
      prepareWranglerConfig({ inputPath, databaseId, outputPath: path.join(temp, "..", "outside.json"), runnerTemp: temp }),
      /RUNNER_TEMP/,
    );
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("HASH_SALT 检查只验证名称存在，不要求或输出 secret 值", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "cnmcp-secrets-"));
  const valid = path.join(temp, "valid.json");
  const invalid = path.join(temp, "invalid.json");
  await writeFile(valid, JSON.stringify([{ name: "HASH_SALT", type: "secret_text" }]));
  await writeFile(invalid, JSON.stringify([{ name: "OTHER" }]));
  try {
    await assert.doesNotReject(assertHashSaltSecret(valid));
    await assert.rejects(assertHashSaltSecret(invalid), /HASH_SALT/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("构建摘要只包含受控计数和平台 ID", async () => {
  const catalog = {
    resources: [{ kind: "mcp" }, { kind: "skill" }, { kind: "plugin" }, { kind: "mcp" }],
    platforms: [{ id: "codex", enabled: true }, { id: "disabled", enabled: false }],
  };
  const summary = createBuildSummary(catalog, 12);
  assert.match(summary, /资源总数：4/);
  assert.match(summary, /mcp 数量：2/);
  assert.match(summary, /启用平台：codex/);
  assert.match(summary, /生成路由数量：12/);
  assert.doesNotMatch(summary, /TOKEN|SECRET|PASSWORD/);

  const temp = await mkdtemp(path.join(os.tmpdir(), "cnmcp-summary-"));
  await mkdir(path.join(temp, "out", "resources", "one"), { recursive: true });
  await writeFile(path.join(temp, "catalog.json"), JSON.stringify(catalog));
  await writeFile(path.join(temp, "out", "index.html"), "");
  await writeFile(path.join(temp, "out", "resources", "one", "index.html"), "");
  await writeFile(path.join(temp, "out", "sitemap.xml"), "");
  try {
    assert.match(await generateBuildSummary({ catalogPath: path.join(temp, "catalog.json"), outputDirectory: path.join(temp, "out"), summaryPath: undefined }), /生成路由数量：3/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("Pages 烟测覆盖主页、列表、全部分类/启用平台、SEO、随机详情，并单独检查 404", () => {
  const paths = createPagesSmokePaths({
    resources: [{ id: "safe-resource" }],
    indexes: { kinds: { mcp: [], plugin: [], skill: [] } },
    platforms: [{ id: "codex", enabled: true }, { id: "later", enabled: false }],
  }, 0);
  assert.deepEqual(paths, ["/", "/resources/", "/category/mcp/", "/category/plugin/", "/category/skill/", "/platform/codex/", "/sitemap.xml", "/robots.txt", "/resources/safe-resource/"]);
});

test("Pages URL 提取与 Worker 路径门拒绝不受控输入并识别生产相关变更", () => {
  assert.equal(extractPagesDeploymentUrl("Deployment complete! https://abc123.cnmcp.pages.dev"), "https://abc123.cnmcp.pages.dev");
  assert.throws(() => extractPagesDeploymentUrl("https://attacker.example"), /没有找到/);
  assert.equal(requiresWorkerDeployment(["app/page.tsx"]), false);
  assert.equal(requiresWorkerDeployment(["worker/src/index.ts"]), true);
  assert.equal(requiresWorkerDeployment(["scripts/sync-stats-catalog.mjs"]), true);
});
