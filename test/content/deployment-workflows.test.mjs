import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const workflowNames = ["pr-validation.yml", "content-review.yml", "deploy-worker.yml", "deploy-pages.yml"];

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
  for (const required of ["Validate resource content", "Generate deterministic catalogs", "Check featured and maintainer-review security policy", "Lint root application and scripts", "Typecheck root application", "Run all root tests", "Build static export", "Run Worker lint, typecheck and tests", "Build Worker deployment bundle without upload"]) {
    assert.ok(names.includes(required), required);
  }
  assert.match(source, /yarn-1\.22\.19\.cjs install --frozen-lockfile/);
  assert.match(source, /npm ci --prefix worker/);
});

test("Worker 生产工作流使用受保护环境且远程步骤严格按迁移、同步、部署、烟测排序", async () => {
  const { source, value } = await workflow("deploy-worker.yml");
  assert.equal(value.jobs.deploy.environment, "production-worker");
  const ordered = ["Run Worker lint, typecheck and tests", "Build Worker deployment bundle without upload", "Apply remote D1 migrations", "Synchronize remote D1 resource catalog", "Deploy Worker", "Smoke test Worker protocol and privacy boundaries"];
  const indexes = ordered.map((name) => stepIndex(value, "deploy", name));
  assert.ok(indexes.every((index) => index >= 0));
  assert.deepEqual(indexes, [...indexes].sort((a, b) => a - b));
  assert.match(source, /HASH_SALT is preconfigured/);
  assert.doesNotMatch(source, /HASH_SALT:\s*\$\{\{/);
});

test("Pages 生产工作流在 Worker 安全门和 D1 同步后构建，先烟测候选再发布同一产物", async () => {
  const { source, value } = await workflow("deploy-pages.yml");
  assert.equal(value.jobs.deploy.environment, "production-pages");
  const ordered = ["Validate resource content", "Generate deterministic catalogs", "Require matching Worker deployment when Worker paths changed", "Synchronize remote D1 resource catalog", "Build root static export", "Deploy immutable candidate to Pages", "Smoke test candidate static deployment", "Publish verified artifact to Pages production"];
  const indexes = ordered.map((name) => stepIndex(value, "deploy", name));
  assert.ok(indexes.every((index) => index >= 0));
  assert.deepEqual(indexes, [...indexes].sort((a, b) => a - b));
  assert.match(source, /NEXT_PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN/);
  assert.match(source, /worker\/node_modules\/wrangler\/bin\/wrangler\.js pages deploy/);
});
