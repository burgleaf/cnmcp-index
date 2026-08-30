import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { auditStaticRuntime, formatAuditResult } from "../../scripts/audit-static-runtime.mjs";

const appPages = [
  "page.tsx",
  "category/[kind]/page.tsx",
  "platform/[platform]/page.tsx",
  "resources/page.tsx",
  "resources/[id]/page.tsx",
  "submit/page.tsx",
  "tags/[tag]/page.tsx",
];

async function writeFixtureFile(projectRoot, relativePath, content = "") {
  const target = path.join(projectRoot, ...relativePath.split("/"));
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, "utf8");
}

async function createStaticProjectFixture() {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "cnmcp-runtime-audit-"));
  const scripts = {
    "validate:resources": "node validate.mjs",
    "generate:catalog": "node generate.mjs",
    build: "next build",
    lint: "eslint app components lib scripts test",
    typecheck: "tsc --noEmit",
    test: "node --test",
    "test:static-fixture": "node fixture.mjs",
    "worker:check": "npm --prefix worker run check",
    "worker:dry-run": "npm --prefix worker run dry-run",
    "audit:static-runtime": "node scripts/audit-static-runtime.mjs",
  };
  await writeFixtureFile(projectRoot, "package.json", JSON.stringify({ scripts, dependencies: { next: "15.5.23" } }));
  await writeFixtureFile(projectRoot, "next.config.ts", "export default { output: \"export\" };\n");
  await writeFixtureFile(projectRoot, "tsconfig.json", JSON.stringify({ include: ["app/**/*.tsx", "components/**/*.tsx", "lib/**/*.ts"] }));
  await writeFixtureFile(projectRoot, "tailwind.config.js", "module.exports = { content: ['./app/**/*.tsx', './components/**/*.tsx'] };\n");
  for (const page of appPages) await writeFixtureFile(projectRoot, `app/${page}`, "export default function Page() { return null; }\n");
  await writeFixtureFile(projectRoot, "components/card.tsx", "import type { ReactNode } from \"react\"; export function Card({ children }: { children: ReactNode }) { return children; }\n");
  await writeFixtureFile(projectRoot, "lib/catalog.ts", "import catalog from \"../public/catalog.json\"; export { catalog };\n");
  await writeFixtureFile(projectRoot, "public/catalog.json", "{}\n");
  await writeFixtureFile(projectRoot, "worker/package.json", JSON.stringify({ private: true, type: "module", scripts: { check: "vitest run", "dry-run": "wrangler deploy --dry-run" } }));
  for (const file of ["index.html", "404.html", "catalog.json", "sitemap.xml", "robots.txt", "_next/static/app.js"]) {
    await writeFixtureFile(projectRoot, `out/${file}`, "fixture\n");
  }
  await writeFixtureFile(projectRoot, "data/legacy.md", "archived\n");
  await writeFixtureFile(projectRoot, "docs/history.md", "archived\n");
  await writeFixtureFile(projectRoot, "src/components/legacy.tsx", "export const Legacy = null;\n");
  return projectRoot;
}

test("纯静态根应用、独立 Worker 与明确非运行残留通过审计", async () => {
  const projectRoot = await createStaticProjectFixture();
  try {
    const result = await auditStaticRuntime({ projectRoot });
    assert.equal(result.passed, true, formatAuditResult(result));
    assert.match(formatAuditResult(result), /data\/ 1 个文件；docs\/ 1 个文件；src\/ 1 个文件/);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("审计按结构和模块导入识别 SSR/旧系统违规，不受文档文字影响", async () => {
  const projectRoot = await createStaticProjectFixture();
  try {
    await writeFixtureFile(projectRoot, "docs/terms.md", "Express PM2 Docker OAuth Server Actions 仅为迁移记录。\n");
    let result = await auditStaticRuntime({ projectRoot });
    assert.equal(result.passed, true, formatAuditResult(result));

    await writeFixtureFile(projectRoot, "server.js", "export {};\n");
    await writeFixtureFile(projectRoot, "app/api/stats/route.ts", "export function GET() {}\n");
    await writeFixtureFile(projectRoot, "components/server-reader.ts", "import { readFile } from \"node:fs/promises\"; export { readFile };\n");
    await writeFixtureFile(projectRoot, "out/user/profile/index.html", "legacy\n");
    await writeFixtureFile(projectRoot, "out/[unexpanded]/index.html", "dynamic\n");
    result = await auditStaticRuntime({ projectRoot });

    assert.equal(result.passed, false);
    assert.match(result.issues.join("\n"), /server\.js/);
    assert.match(result.issues.join("\n"), /Route Handler/);
    assert.match(result.issues.join("\n"), /node:fs\/promises/);
    assert.match(result.issues.join("\n"), /旧系统路由根：user/);
    assert.match(result.issues.join("\n"), /未展开动态路由/);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});
