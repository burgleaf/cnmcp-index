import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const workflowNames = ["pr-validation.yml", "content-review.yml", "deploy-worker.yml", "deploy-pages.yml", "deploy-discovery.yml"];

async function workflow(name) {
  const source = await readFile(path.join(ROOT, ".github", "workflows", name), "utf8");
  return { source, value: yaml.load(source) };
}

function stepIndex(value, jobName, stepName) {
  return value.jobs[jobName].steps.findIndex((step) => step.name === stepName);
}

test("所有任务 8 工作流 YAML 可解析且第三方 actions 固定到完整 commit", async () => {
  for (const name of workflowNames) {
    const { source, value } = await workflow(name);
    assert.equal(typeof value, "object", name);
    for (const match of source.matchAll(/uses:\s*([^\s#]+)/g)) {
      assert.match(match[1], /^[^@]+@[a-f0-9]{40}$/, `${name}: ${match[1]}`);
    }
  }
});

test("PR 工作流只有只读权限，无 Cloudflare secret，并按要求执行完整根检查与 Worker 条件检查", async () => {
  const { source, value } = await workflow("pr-validation.yml");
  assert.deepEqual(value.permissions, { contents: "read" });
  assert.doesNotMatch(source, /CLOUDFLARE_API_TOKEN|HASH_SALT|environment:\s*production/);
  const names = value.jobs.validate.steps.map((step) => step.name);
  for (const required of ["Validate resource content", "Generate deterministic catalogs", "Check featured and maintainer-review security policy", "Lint root application and scripts", "Typecheck root application", "Run all root tests", "Build static export", "Run Worker lint, typecheck and tests", "Build Worker deployment bundle without upload", "Run Discovery lint, typecheck and tests", "Build Discovery deployment bundle without upload"]) {
    assert.ok(names.includes(required), required);
  }
  assert.match(source, /yarn-1\.22\.19\.cjs install --frozen-lockfile/);
  assert.match(source, /npm ci --prefix worker/);
  assert.match(source, /npm ci --prefix discovery/);
});

test("Worker 生产工作流使用仓库级 Secrets，远程步骤严格按迁移、同步、部署、烟测排序", async () => {
  const { source, value } = await workflow("deploy-worker.yml");
  assert.equal(value.jobs.deploy.environment, undefined);
  assert.match(source, /secrets\.CLOUDFLARE_API_TOKEN/);
  assert.match(source, /secrets\.CLOUDFLARE_ACCOUNT_ID/);
  assert.doesNotMatch(source, /vars\.CLOUDFLARE_|CLOUDFLARE_D1_DATABASE_ID|prepare-wrangler-config|environment:\s*production/);
  const ordered = ["Run Worker lint, typecheck and tests", "Build Worker deployment bundle without upload", "Apply remote D1 migrations", "Synchronize remote D1 resource catalog", "Deploy Worker", "Smoke test Worker protocol and privacy boundaries"];
  const indexes = ordered.map((name) => stepIndex(value, "deploy", name));
  assert.ok(indexes.every((index) => index >= 0));
  assert.deepEqual(indexes, [...indexes].sort((a, b) => a - b));
  assert.match(source, /HASH_SALT is preconfigured/);
  assert.doesNotMatch(source, /HASH_SALT:\s*\$\{\{/);
  assert.match(source, /WORKER_API_URL: https:\/\/cnmcp-stats-api\.burgleaf\.workers\.dev/);
  assert.match(source, /d1 execute DB --remote/);
  assert.match(source, /--file=worker\/migrations\/0001_initial_stats\.sql/);
  assert.doesNotMatch(source, /d1 migrations apply/);
});

test("Pages 生产工作流在 Worker 安全门和 D1 同步后构建，先烟测候选再发布同一产物", async () => {
  const { source, value } = await workflow("deploy-pages.yml");
  assert.ok(value.on.workflow_dispatch === null || value.on.workflow_dispatch);
  assert.match(source, /github\.event_name == 'workflow_dispatch'/);
  assert.equal(value.jobs.deploy.environment, undefined);
  assert.match(source, /secrets\.CLOUDFLARE_API_TOKEN/);
  assert.match(source, /secrets\.CLOUDFLARE_ACCOUNT_ID/);
  assert.match(source, /--project-name cnmcp-index/);
  assert.match(source, /pages project create cnmcp-index --production-branch=main/);
  assert.match(source, /https:\/\/www\.cnmcp\.com/);
  assert.match(source, /https:\/\/api\.cnmcp\.com/);
  assert.match(source, /https:\/\/discovery\.cnmcp\.com/);
  assert.doesNotMatch(source, /CLOUDFLARE_D1_DATABASE_ID|CLOUDFLARE_PAGES_PROJECT|prepare-wrangler-config|environment:\s*production/);
  const ordered = ["Validate resource content", "Generate deterministic catalogs", "Require matching Worker deployment when Worker paths changed", "Apply remote D1 migrations", "Synchronize remote D1 resource catalog", "Build root static export", "Ensure Pages project exists", "Deploy immutable candidate to Pages", "Smoke test candidate static deployment", "Publish verified artifact to Pages production"];
  const indexes = ordered.map((name) => stepIndex(value, "deploy", name));
  assert.ok(indexes.every((index) => index >= 0));
  assert.deepEqual(indexes, [...indexes].sort((a, b) => a - b));
  assert.match(source, /NEXT_PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN/);
  assert.match(source, /worker\/node_modules\/wrangler\/bin\/wrangler\.js pages deploy/);
  assert.match(source, /d1 execute DB --remote/);
  assert.match(source, /--file=worker\/migrations\/0001_initial_stats\.sql/);
  assert.doesNotMatch(source, /d1 migrations apply/);
});

test("Discovery 生产工作流使用仓库级 Secrets，远程步骤按检查、迁移、部署、烟测排序且不开 Catalog 同步", async () => {
  const { source, value } = await workflow("deploy-discovery.yml");
  assert.equal(value.jobs.deploy.environment, undefined);
  assert.match(source, /secrets\.CLOUDFLARE_API_TOKEN/);
  assert.match(source, /secrets\.CLOUDFLARE_ACCOUNT_ID/);
  assert.doesNotMatch(source, /vars\.CLOUDFLARE_|CLOUDFLARE_D1_DATABASE_ID|prepare-wrangler-config|environment:\s*production/);
  const ordered = ["Run Discovery lint, typecheck and tests", "Build Discovery deployment bundle without upload", "Apply remote D1 migrations", "Deploy Discovery Worker", "Smoke test Discovery protocol and privacy boundaries"];
  const indexes = ordered.map((name) => stepIndex(value, "deploy", name));
  assert.ok(indexes.every((index) => index >= 0));
  assert.deepEqual(indexes, [...indexes].sort((a, b) => a - b));
  assert.match(source, /GITHUB_TOKEN is preconfigured/);
  assert.doesNotMatch(source, /GITHUB_TOKEN:\s*\$\{\{/);
  assert.match(source, /DISCOVERY_API_URL: https:\/\/cnmcp-discovery-api\.burgleaf\.workers\.dev/);
  assert.match(source, /d1 execute DB --remote/);
  assert.match(source, /--file=discovery\/migrations\/0001_discovery\.sql/);
  assert.match(source, /--file=discovery\/migrations\/0002_promotions\.sql/);
  assert.doesNotMatch(source, /d1 migrations apply/);
  assert.doesNotMatch(source, /sync-stats-catalog/);
});
