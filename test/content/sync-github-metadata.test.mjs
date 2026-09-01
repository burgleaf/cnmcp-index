import assert from "node:assert/strict";
import test from "node:test";

import { parseAtomUpdated, parseRepositoryPage } from "../../scripts/sync-github-metadata.mjs";

test("从 GitHub 页面只提取质量评分需要的公开仓库事实", () => {
  const page = parseRepositoryPage('<script>{"isArchived":false,"stargazerCount":1234,"forksCount":56,"defaultBranch":"main"}</script>');
  assert.deepEqual(page, { stars: 1234, forks: 56, archived: false, defaultBranch: "main" });
  assert.equal(parseAtomUpdated("<feed><updated>2026-08-31T10:20:30Z</updated></feed>"), "2026-08-31T10:20:30Z");
  assert.equal(parseAtomUpdated("<feed></feed>"), null);
});

test("缺少质量字段时明确失败，不写入猜测数据", () => {
  assert.throws(() => parseRepositoryPage('{"stargazerCount":10}'), /Forks/);
});
