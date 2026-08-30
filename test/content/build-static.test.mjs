import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runStaticBuild } from "../../scripts/build-static.mjs";

async function exists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function createProject(resourceCount) {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "cnmcp-static-build-"));
  const routeDirectory = path.join(projectRoot, "app", "resources", "[id]");
  await mkdir(routeDirectory, { recursive: true });
  await mkdir(path.join(projectRoot, ".generated"), { recursive: true });
  await writeFile(path.join(routeDirectory, "page.tsx"), "export default function Page() {}\n", "utf8");
  await writeFile(
    path.join(projectRoot, ".generated", "resources.generated.json"),
    `${JSON.stringify({ resources: Array.from({ length: resourceCount }, (_, index) => ({ id: `resource-${index}` })) })}\n`,
    "utf8",
  );
  return { projectRoot, routeDirectory };
}

test("空 Catalog 构建期间移出动态路由且成功后恢复，不生成哨兵资源", async () => {
  const fixture = await createProject(0);
  try {
    await runStaticBuild({
      projectRoot: fixture.projectRoot,
      runBuild: async () => {
        assert.equal(await exists(fixture.routeDirectory), false);
        const catalog = JSON.parse(await readFile(path.join(fixture.projectRoot, ".generated", "resources.generated.json"), "utf8"));
        assert.deepEqual(catalog.resources, []);
      },
    });
    assert.equal(await exists(fixture.routeDirectory), true);
  } finally {
    await rm(fixture.projectRoot, { recursive: true, force: true });
  }
});

test("空 Catalog 构建失败也恢复路由；非空 Catalog 始终保留真实路由", async () => {
  const emptyFixture = await createProject(0);
  const populatedFixture = await createProject(1);
  try {
    await assert.rejects(
      runStaticBuild({ projectRoot: emptyFixture.projectRoot, runBuild: async () => { throw new Error("fixture failure"); } }),
      /fixture failure/,
    );
    assert.equal(await exists(emptyFixture.routeDirectory), true);

    await runStaticBuild({
      projectRoot: populatedFixture.projectRoot,
      runBuild: async () => assert.equal(await exists(populatedFixture.routeDirectory), true),
    });
  } finally {
    await Promise.all([
      rm(emptyFixture.projectRoot, { recursive: true, force: true }),
      rm(populatedFixture.projectRoot, { recursive: true, force: true }),
    ]);
  }
});
