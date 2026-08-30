import assert from "node:assert/strict";
import test from "node:test";

import {
  detectFeaturedChange,
  hasCurrentMaintainerApproval,
  isProtectedContentPath,
} from "../../scripts/check-content-review.mjs";

test("资源、平台、标签和 Schema 路径受审核保护，其他路径不误拦截", () => {
  for (const filePath of [
    "resources/demo/resource.json",
    "resources/demo/README.md",
    "catalog/platforms.json",
    "catalog/tags.json",
    "schemas/resource.schema.json",
  ]) assert.equal(isProtectedContentPath(filePath), true, filePath);
  for (const filePath of ["app/page.tsx", "catalog.json", "docs/content-review.md"])
    assert.equal(isProtectedContentPath(filePath), false, filePath);
});

test("featured 审计明确报告新增、提升和移除，但忽略非资源文件与等值变化", () => {
  assert.deepEqual(
    detectFeaturedChange("resources/demo/resource.json", { featured: false }, { featured: true }),
    { filePath: "resources/demo/resource.json", before: false, after: true },
  );
  assert.deepEqual(
    detectFeaturedChange("resources/demo/resource.json", { featured: true }, null),
    { filePath: "resources/demo/resource.json", before: true, after: false },
  );
  assert.equal(detectFeaturedChange("resources/demo/README.md", {}, { featured: true }), null);
  assert.equal(detectFeaturedChange("resources/demo/resource.json", {}, { featured: false }), null);
});

test("只接受当前提交且具有维护权限的批准，旧提交、只读者和变更请求均无效", () => {
  const currentApproval = [{
    state: "APPROVED",
    commit_id: "head-sha",
    user: { login: "maintainer" },
  }];
  assert.equal(hasCurrentMaintainerApproval(currentApproval, "head-sha", { maintainer: "write" }), true);
  assert.equal(hasCurrentMaintainerApproval(currentApproval, "new-head", { maintainer: "admin" }), false);
  assert.equal(hasCurrentMaintainerApproval(currentApproval, "head-sha", { maintainer: "read" }), false);
  assert.equal(hasCurrentMaintainerApproval([
    ...currentApproval,
    { state: "CHANGES_REQUESTED", commit_id: "head-sha", user: { login: "maintainer" } },
  ], "head-sha", { maintainer: "maintain" }), false);
});
