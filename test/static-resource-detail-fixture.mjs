import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, readdir, rm, symlink } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(TEST_DIRECTORY, "..");
const FIXTURE_ROOT = path.join(TEST_DIRECTORY, "fixtures", "full-acceptance");
const PUBLIC_RESOURCE_IDS = ["acceptance-mcp", "acceptance-skill", "acceptance-plugin"];
const EXCLUDED_RESOURCE_IDS = ["acceptance-unlisted", "acceptance-removed"];
const EXPECTED_KINDS = new Map([
  ["acceptance-mcp", "MCP"],
  ["acceptance-skill", "Skill"],
  ["acceptance-plugin", "Plugin"],
]);

function runNode(scriptPath, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], { cwd, stdio: "inherit", env: process.env });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) reject(new Error(`隔离 fixture 构建被信号 ${signal} 终止`));
      else if (code === 0) resolve();
      else reject(new Error(`${path.basename(scriptPath)} 失败，退出码 ${code}`));
    });
  });
}

async function copyProjectSource(targetRoot) {
  const directories = ["app", "catalog", "components", "examples", "lib", "public", "schemas", "scripts"];
  const rootFiles = ["next.config.ts", "next-env.d.ts", "package.json", "postcss.config.js", "tailwind.config.js", "tsconfig.json"];
  const filter = (source) => !/\.test\.[cm]?[jt]sx?$/.test(source);

  await Promise.all([
    ...directories.map((directory) => cp(path.join(PROJECT_ROOT, directory), path.join(targetRoot, directory), { recursive: true, filter })),
    ...rootFiles.map((file) => cp(path.join(PROJECT_ROOT, file), path.join(targetRoot, file))),
  ]);
  await cp(path.join(FIXTURE_ROOT, "resources"), path.join(targetRoot, "resources"), { recursive: true });
  await symlink(path.join(PROJECT_ROOT, "node_modules"), path.join(targetRoot, "node_modules"), "junction");
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function assertContains(html, expected, context) {
  assert.ok(html.includes(expected), `${context} 缺少：${expected}`);
}

function extractJsonLd(html, resourceId) {
  const match = html.match(/<script[^>]+type="application\/ld\+json"[^>]*>([^<]+)<\/script>/);
  assert.ok(match, `${resourceId} 缺少可解析 JSON-LD`);
  return JSON.parse(match[1]);
}

async function verifyResourceHtml(targetRoot, resource) {
  const htmlPath = path.join(targetRoot, "out", "resources", resource.id, "index.html");
  const html = await readFile(htmlPath, "utf8");
  const canonical = `https://www.cnmcp.com/resources/${resource.id}/`;
  const kindLabel = EXPECTED_KINDS.get(resource.id);
  const description = `${resource.name}（${resource.id}）— ${resource.summary}`;
  const image = resource.preview
    ? new URL(resource.preview, "https://www.cnmcp.com/").toString()
    : "https://www.cnmcp.com/images/resource-placeholder.svg";

  for (const [expected, label] of [
    [`<title>${resource.name}（${kindLabel} · ${resource.id}） | CNMCP AI扩展社区</title>`, "title"],
    [`name="description" content="${description}"`, "description"],
    [`rel="canonical" href="${canonical}"`, "canonical"],
    ['property="og:type" content="article"', "Open Graph 类型"],
    [`property="og:url" content="${canonical}"`, "Open Graph URL"],
    [`property="og:title" content="${resource.name}（${kindLabel} · ${resource.id}）"`, "Open Graph 标题"],
    [`property="og:description" content="${description}"`, "Open Graph 描述"],
    [`property="og:image" content="${image}"`, "Open Graph 图片"],
    ['name="twitter:card" content="summary_large_image"', "Twitter Card"],
    [`name="twitter:title" content="${resource.name}（${kindLabel} · ${resource.id}）"`, "Twitter 标题"],
    [`name="twitter:description" content="${description}"`, "Twitter 描述"],
    [`name="twitter:image" content="${image}"`, "Twitter 图片"],
  ]) assertContains(html, expected, `${resource.id} ${label}`);

  for (const expected of [
    resource.name,
    resource.summary,
    resource.author.name,
    resource.license,
    "来源可核验",
    "质量与活跃度",
    "统计数据加载中",
    'rel="noopener noreferrer"',
    'target="_blank"',
  ]) assertContains(html, expected, `${resource.id} 静态详情`);
  for (const link of [resource.repository, resource.homepage, resource.documentation].filter(Boolean)) {
    assertContains(html, `href="${link}"`, `${resource.id} 外链`);
  }

  const jsonLd = extractJsonLd(html, resource.id);
  assert.equal(jsonLd["@id"], canonical, `${resource.id} JSON-LD @id`);
  assert.equal(jsonLd.url, canonical, `${resource.id} JSON-LD url`);
  assert.equal(jsonLd.name, resource.name, `${resource.id} JSON-LD name`);
  assert.equal(jsonLd.codeRepository, resource.repository, `${resource.id} JSON-LD repository`);
  assert.equal(jsonLd.license, resource.license, `${resource.id} JSON-LD license`);
  assert.equal(jsonLd.author.name, resource.author.name, `${resource.id} JSON-LD author`);
  assert.equal(jsonLd.runtimePlatform, undefined, `${resource.id} JSON-LD 不应暴露平台兼容性`);
  assert.deepEqual(
    jsonLd.additionalProperty.map((entry) => entry.name),
    ["资源类型", "综合质量", "GitHub Stars"],
    `${resource.id} JSON-LD 仅保留资源与质量信息`,
  );
  if (resource.kind === "skill") assert.equal(jsonLd["@type"], "CreativeWork");
  else assert.deepEqual(jsonLd["@type"], ["CreativeWork", "SoftwareSourceCode"]);

  return { title: `${resource.name}（${kindLabel} · ${resource.id}）`, description };
}

async function main() {
  const formalResourcesBefore = (await readdir(path.join(PROJECT_ROOT, "resources"))).sort();
  const targetRoot = await mkdtemp(path.join(PROJECT_ROOT, ".tmp-full-acceptance-"));
  try {
    await copyProjectSource(targetRoot);
    await runNode(path.join(targetRoot, "scripts", "validate-resources.mjs"), targetRoot);
    await runNode(path.join(targetRoot, "scripts", "generate-catalog.mjs"), targetRoot);
    await runNode(path.join(targetRoot, "scripts", "build-static.mjs"), targetRoot);

    const generatedCatalog = await readJson(path.join(targetRoot, ".generated", "resources.generated.json"));
    const publicCatalog = await readJson(path.join(targetRoot, "public", "catalog.json"));
    assert.deepEqual(
      [...generatedCatalog.resources.map((resource) => resource.id)].sort(),
      [...PUBLIC_RESOURCE_IDS].sort(),
      "完整 Catalog 必须只包含三类公开 fixture",
    );
    assert.deepEqual(
      [...publicCatalog.resources.map((resource) => resource.id)].sort(),
      [...PUBLIC_RESOURCE_IDS].sort(),
      "客户端 Catalog 必须只包含三类公开 fixture",
    );
    assert.deepEqual(
      [...new Set(publicCatalog.resources.map((resource) => resource.kind))].sort(),
      ["mcp", "plugin", "skill"],
      "客户端 Catalog 必须覆盖三类资源",
    );

    const metadata = [];
    for (const resource of generatedCatalog.resources) metadata.push(await verifyResourceHtml(targetRoot, resource));
    assert.equal(new Set(metadata.map((entry) => entry.title)).size, PUBLIC_RESOURCE_IDS.length, "公开资源 title 必须唯一");
    assert.equal(new Set(metadata.map((entry) => entry.description)).size, PUBLIC_RESOURCE_IDS.length, "公开资源 description 必须唯一");

    const home = await readFile(path.join(targetRoot, "out", "index.html"), "utf8");
    assertContains(home, 'href="/resources/"', "首页目录入口");
    for (const resourceId of PUBLIC_RESOURCE_IDS) {
      assertContains(home, `href="/resources/${resourceId}/"`, `首页 ${resourceId} 详情入口`);
    }
    const directory = await readFile(path.join(targetRoot, "out", "resources", "index.html"), "utf8");
    for (const expected of ["搜索名称、用途、作者", "全部", "MCP", "Skill", "插件", "综合质量"]) {
      assertContains(directory, expected, "资源目录静态表单");
    }
    for (const excluded of ["全部平台", "兼容状态", "最近收录"]) assert.ok(!directory.includes(excluded), `资源目录不应包含：${excluded}`);

    for (const kind of ["mcp", "skill", "plugin"]) {
      await readFile(path.join(targetRoot, "out", "category", kind, "index.html"), "utf8");
    }
    for (const platform of ["codex", "claude-code"]) {
      await readFile(path.join(targetRoot, "out", "platform", platform, "index.html"), "utf8");
    }

    const mcpHtml = await readFile(path.join(targetRoot, "out", "resources", "acceptance-mcp", "index.html"), "utf8");
    for (const expected of [
      "复制安装内容",
      "acceptance-mcp install --token",
      "Cursor",
      "Gemini CLI",
      "仅支持本地项目，远程工作区需手动配置",
      "隔离验收说明",
    ]) assertContains(mcpHtml, expected, "MCP AI 安装与 Markdown");
    const pluginHtml = await readFile(path.join(targetRoot, "out", "resources", "acceptance-plugin", "index.html"), "utf8");
    assert.ok(!pluginHtml.includes("原作者支持的平台"), "详情页不应继续展示平台兼容卡片");

    const sitemap = await readFile(path.join(targetRoot, "out", "sitemap.xml"), "utf8");
    for (const expected of [
      ...PUBLIC_RESOURCE_IDS.map((id) => `https://www.cnmcp.com/resources/${id}/`),
      "https://www.cnmcp.com/category/mcp/",
      "https://www.cnmcp.com/category/skill/",
      "https://www.cnmcp.com/category/plugin/",
      "https://www.cnmcp.com/topics/",
      "https://www.cnmcp.com/submit/",
      "https://www.cnmcp.com/discover/",
    ]) assertContains(sitemap, expected, "sitemap");
    assert.ok(!sitemap.includes("/platform/"), "sitemap 不得包含旧平台入口");
    for (const excluded of [...EXCLUDED_RESOURCE_IDS, "__empty-catalog__"]) {
      assert.ok(!sitemap.includes(excluded), `sitemap 不得包含：${excluded}`);
      await assert.rejects(readFile(path.join(targetRoot, "out", "resources", excluded, "index.html"), "utf8"), { code: "ENOENT" });
    }

    const robots = await readFile(path.join(targetRoot, "out", "robots.txt"), "utf8");
    assert.match(robots, /Allow: \//);
    assert.match(robots, /Sitemap: https:\/\/www\.cnmcp\.com\/sitemap\.xml/);
    const notFound = await readFile(path.join(targetRoot, "out", "404.html"), "utf8");
    for (const expected of ["404", "页面不存在", "可能已移动、下架或从未存在", "返回首页"]) {
      assertContains(notFound, expected, "统一 404");
    }
    await assert.rejects(
      readFile(path.join(targetRoot, "out", "resources", "acceptance-missing", "index.html"), "utf8"),
      { code: "ENOENT" },
    );

    const submit = await readFile(path.join(targetRoot, "out", "submit", "index.html"), "utf8");
    for (const expected of ["投稿 AI 扩展资源", "用 AI 助手投稿", "复制提示词", "Pull Request", "不限于编程工具"]) {
      assertContains(submit, expected, "投稿入口");
    }

    console.log("9.1 隔离静态验收通过：3 个公开资源、2 个排除资源、5 种兼容状态、全量 SEO/sitemap/robots/404。");
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
    const formalResourcesAfter = (await readdir(path.join(PROJECT_ROOT, "resources"))).sort();
    assert.deepEqual(formalResourcesAfter, formalResourcesBefore, "隔离验收不得污染正式 resources/");
  }
}

await main();
