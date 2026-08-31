import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createBuildSummary, generateBuildSummary } from "../../scripts/ci-build-summary.mjs";
import {
  assertCommittedD1DatabaseId,
  assertHashSaltSecret,
  assertNamedSecret,
  DISCOVERY_D1_PLACEHOLDER,
  validateDeploymentEnvironment,
} from "../../scripts/check-cloudflare-prerequisites.mjs";
import { extractPagesDeploymentUrl } from "../../scripts/extract-pages-deployment-url.mjs";
import { createPagesSmokePaths } from "../../scripts/smoke-deployment.mjs";
import { requiresWorkerDeployment, skipsWorkerDeploymentGate } from "../../scripts/wait-worker-deployment.mjs";

const databaseId = "01234567-89ab-cdef-0123-456789abcdef";
const baseEnvironment = {
  CLOUDFLARE_ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
  CLOUDFLARE_API_TOKEN: "test-only-token",
};

test("部署前置检查只要求仓库级 Token 与 Account ID", () => {
  assert.doesNotThrow(() => validateDeploymentEnvironment("worker", baseEnvironment));
  assert.doesNotThrow(() => validateDeploymentEnvironment("pages", baseEnvironment));
  assert.doesNotThrow(() => validateDeploymentEnvironment("discovery", baseEnvironment));
  assert.throws(() => validateDeploymentEnvironment("worker", { ...baseEnvironment, CLOUDFLARE_ACCOUNT_ID: "not-an-id" }), /格式/);
  assert.throws(() => validateDeploymentEnvironment("worker", { ...baseEnvironment, CLOUDFLARE_API_TOKEN: "" }), /缺少/);
  assert.throws(() => validateDeploymentEnvironment("other", baseEnvironment), /worker、pages 或 discovery/);
});

test("已提交的 D1 ID 必须是真实 ID，不能是占位符", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "cnmcp-d1-"));
  const valid = path.join(temp, "valid.jsonc");
  const placeholder = path.join(temp, "placeholder.jsonc");
  await writeFile(valid, JSON.stringify({ d1_databases: [{ binding: "DB", database_id: databaseId }] }));
  await writeFile(placeholder, JSON.stringify({ d1_databases: [{ binding: "DB", database_id: "REPLACE_WITH_D1_DATABASE_ID" }] }));
  try {
    await assert.doesNotReject(assertCommittedD1DatabaseId(valid));
    await assert.rejects(assertCommittedD1DatabaseId(placeholder), /真实 D1/);
    await writeFile(placeholder, JSON.stringify({ d1_databases: [{ binding: "DB", database_id: DISCOVERY_D1_PLACEHOLDER }] }));
    await assert.doesNotReject(assertCommittedD1DatabaseId(placeholder));
    await assert.rejects(assertCommittedD1DatabaseId(placeholder, { disallowIds: [DISCOVERY_D1_PLACEHOLDER] }), /占位 D1/);
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
    await assert.doesNotReject(assertNamedSecret(valid, "HASH_SALT"));
    await assert.rejects(assertNamedSecret(invalid, "GITHUB_TOKEN"), /GITHUB_TOKEN/);
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
  assert.deepEqual(paths, ["/", "/resources/", "/discover/", "/category/mcp/", "/category/plugin/", "/category/skill/", "/platform/codex/", "/sitemap.xml", "/robots.txt", "/resources/safe-resource/"]);
});

test("Pages URL 提取与 Worker 路径门拒绝不受控输入并识别生产相关变更", () => {
  assert.equal(extractPagesDeploymentUrl("Deployment complete! https://abc123.cnmcp.pages.dev"), "https://abc123.cnmcp.pages.dev");
  assert.equal(
    extractPagesDeploymentUrl("https://ci-1.cnmcp-index.pages.dev Deployment complete! https://ad48597b.cnmcp-index.pages.dev"),
    "https://ad48597b.cnmcp-index.pages.dev",
  );
  assert.throws(() => extractPagesDeploymentUrl("https://attacker.example"), /没有找到/);
  assert.equal(requiresWorkerDeployment(["app/page.tsx"]), false);
  assert.equal(requiresWorkerDeployment(["worker/src/index.ts"]), true);
  assert.equal(requiresWorkerDeployment(["scripts/sync-stats-catalog.mjs"]), true);
  assert.equal(requiresWorkerDeployment(["scripts/prepare-wrangler-config.mjs"]), false);
  assert.equal(skipsWorkerDeploymentGate("workflow_dispatch"), true);
  assert.equal(skipsWorkerDeploymentGate("push"), false);
});
