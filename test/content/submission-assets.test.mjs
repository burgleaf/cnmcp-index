import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

async function read(relativePath) {
  return readFile(path.join(PROJECT_ROOT, relativePath), "utf8");
}

test("资源目录示例严格符合 Resource Schema 且不包含投稿者禁用字段", async () => {
  const [schema, example] = await Promise.all([
    read("schemas/resource.schema.json").then(JSON.parse),
    read("examples/resource-submission/resource.json").then(JSON.parse),
  ]);
  const validate = new Ajv2020({ allErrors: true, strict: true, strictRequired: false, strictTypes: false }).compile(schema);
  assert.equal(validate(example), true, JSON.stringify(validate.errors));
  for (const field of ["featured", "verified", "reviewStatus"])
    assert.equal(Object.hasOwn(example, field), false, field);
});

test("Issue Form 收集 Schema 核心字段且不提供精选、可信或审核状态控件", async () => {
  const issueForm = await read(".github/ISSUE_TEMPLATE/resource-submission.yml");
  for (const id of ["resource-kind", "repository-url", "resource-summary", "license", "platform-compatibility"])
    assert.match(issueForm, new RegExp(`id: ${id}`));
  assert.doesNotMatch(issueForm, /id:\s*(?:featured|verified|reviewStatus)\b/i);
  assert.match(issueForm, /不会自动执行/);
});

test("PR 模板明确禁止投稿者控制维护状态并声明未合并内容不进正式 Catalog", async () => {
  const template = await read(".github/pull_request_template.md");
  assert.match(template, /没有设置或修改 `featured`/);
  assert.match(template, /`verified`/);
  assert.match(template, /`reviewStatus`/);
  assert.match(template, /合并到默认分支前不会进入正式 Catalog/);
  assert.match(template, /不会由站点或审核流程自动执行/);
});
