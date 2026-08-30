import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIRECTORY, "..");

const WEB_SOURCE_DIRECTORIES = ["app", "components", "lib"];
const WEB_SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx"]);
const EXPECTED_APP_PAGES = new Set([
  "page.tsx",
  "category/[kind]/page.tsx",
  "platform/[platform]/page.tsx",
  "resources/page.tsx",
  "resources/[id]/page.tsx",
  "submit/page.tsx",
  "tags/[tag]/page.tsx",
]);
const FORBIDDEN_ROOT_ENTRIES = [
  "pages",
  "src/pages",
  "src/services",
  "server.js",
  "ecosystem.config.js",
  "Dockerfile",
  "next-i18next.config.js",
  "next-sitemap.config.js",
];
const FORBIDDEN_DIRECT_DEPENDENCIES = new Set([
  "express",
  "pm2",
  "next-sitemap",
  "next-auth",
  "passport",
  "prisma",
  "@prisma/client",
  "sequelize",
  "mongoose",
  "mysql",
  "mysql2",
  "pg",
  "sqlite3",
  "better-sqlite3",
  "typeorm",
]);
const FORBIDDEN_MODULES = [
  /^(?:node:)?fs(?:\/promises)?$/,
  /^(?:node:)?child_process$/,
  /^(?:node:)?(?:http|https|net|tls|cluster)$/,
  /^express(?:\/|$)/,
  /^next\/(?:server|headers)$/,
  /^(?:next-auth|passport|prisma|@prisma\/client|sequelize|mongoose|mysql2?|pg|sqlite3|better-sqlite3|typeorm)(?:\/|$)/,
  /(?:^|\/)worker(?:\/|$)/,
  /(?:^|\/)src\/(?:pages|services)(?:\/|$)/,
];
const FORBIDDEN_LEGACY_OUTPUT_ROOTS = new Set([
  "article",
  "badge",
  "help",
  "license",
  "links",
  "notification",
  "onefile",
  "periodical",
  "report",
  "repository",
  "search",
  "server-sitemap-index.xml",
  "user",
]);
const FORBIDDEN_LEGACY_PATH_SEGMENTS = new Set([
  "user",
  "users",
  "comment",
  "comments",
  "like",
  "likes",
  "favorite",
  "favorites",
  "rank",
  "ranking",
  "oauth",
  "notification",
  "notifications",
]);
const LEGACY_SSR_PAGE_COUNT = 19;
const ALLOWED_OUTPUT_EXTENSIONS = new Set([
  ".avif", ".css", ".gif", ".html", ".ico", ".jpeg", ".jpg", ".js", ".json", ".map", ".otf",
  ".png", ".svg", ".ttf", ".txt", ".webmanifest", ".webp", ".woff", ".woff2", ".xml",
]);

function toPosix(value) {
  return value.split(path.sep).join("/");
}

async function exists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function collectFiles(directory) {
  if (!(await exists(directory))) return [];
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? collectFiles(target) : [target];
  }));
  return nested.flat().sort((left, right) => left.localeCompare(right));
}

async function readJson(targetPath) {
  return JSON.parse(await readFile(targetPath, "utf8"));
}

function implementationFile(relativePath) {
  const normalized = toPosix(relativePath);
  return WEB_SOURCE_EXTENSIONS.has(path.extname(normalized)) && !/(?:^|\/)[^/]+\.(?:test|spec)\.[^.]+$/.test(normalized);
}

function extractModuleSpecifiers(source) {
  const specifiers = [];
  const patterns = [
    /\b(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) specifiers.push(match[1]);
  }
  return [...new Set(specifiers)];
}

function createCheck(id, title, issues, evidence) {
  return { id, title, passed: issues.length === 0, issues, evidence };
}

async function auditPackageAndConfig(projectRoot) {
  const issues = [];
  const packageJson = await readJson(path.join(projectRoot, "package.json"));
  const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
  const forbiddenDependencies = Object.keys(dependencies).filter((name) => FORBIDDEN_DIRECT_DEPENDENCIES.has(name));
  if (forbiddenDependencies.length > 0) issues.push(`存在旧服务端、OAuth 或内容数据库直接依赖：${forbiddenDependencies.join(", ")}`);

  const scripts = packageJson.scripts ?? {};
  const forbiddenScripts = Object.entries(scripts)
    .filter(([, command]) => /(?:^|\s)(?:next\s+start|pm2(?:\s|$)|docker(?:\s|$)|node\s+server\.js)/i.test(command))
    .map(([name]) => name);
  if (forbiddenScripts.length > 0) issues.push(`存在服务端生产启动脚本：${forbiddenScripts.join(", ")}`);

  const requiredScripts = [
    "validate:resources", "generate:catalog", "build", "lint", "typecheck", "test", "test:static-fixture",
    "worker:check", "worker:dry-run", "audit:static-runtime",
  ];
  const missingScripts = requiredScripts.filter((name) => typeof scripts[name] !== "string");
  if (missingScripts.length > 0) issues.push(`缺少审计所需根脚本：${missingScripts.join(", ")}`);

  const nextConfig = await readFile(path.join(projectRoot, "next.config.ts"), "utf8");
  if (!/\boutput\s*:\s*["']export["']/.test(nextConfig)) issues.push("next.config.ts 未固定 output: export");
  if (/\b(?:rewrites|redirects)\s*\(/.test(nextConfig)) issues.push("next.config.ts 包含需要服务端执行的 rewrites/redirects 配置");

  return createCheck(
    "package-config",
    "根 package、脚本、依赖与 Next 静态输出",
    issues,
    `检查 ${Object.keys(scripts).length} 个脚本、${Object.keys(dependencies).length} 个直接依赖；Next output 为 export。`,
  );
}

async function auditConventionsAndLegacyPaths(projectRoot) {
  const issues = [];
  const presentForbiddenEntries = [];
  for (const entry of FORBIDDEN_ROOT_ENTRIES) {
    if (await exists(path.join(projectRoot, ...entry.split("/")))) presentForbiddenEntries.push(entry);
  }
  if (presentForbiddenEntries.length > 0) issues.push(`旧运行入口或业务目录仍存在：${presentForbiddenEntries.join(", ")}`);

  const appFiles = await collectFiles(path.join(projectRoot, "app"));
  const appRelative = appFiles.map((file) => toPosix(path.relative(path.join(projectRoot, "app"), file)));
  const pageFiles = appRelative.filter((file) => /(?:^|\/)page\.(?:js|jsx|ts|tsx)$/.test(file));
  const unexpectedPages = pageFiles.filter((file) => !EXPECTED_APP_PAGES.has(file));
  const missingPages = [...EXPECTED_APP_PAGES].filter((file) => !pageFiles.includes(file));
  if (unexpectedPages.length > 0) issues.push(`App Router 出现设计外页面：${unexpectedPages.join(", ")}`);
  if (missingPages.length > 0) issues.push(`App Router 缺少设计页面：${missingPages.join(", ")}`);

  const routeHandlers = appRelative.filter((file) => /(?:^|\/)route\.(?:js|jsx|ts|tsx)$/.test(file));
  if (routeHandlers.length > 0) issues.push(`存在动态 Route Handler：${routeHandlers.join(", ")}`);

  const middlewareCandidates = ["middleware.js", "middleware.ts", "src/middleware.js", "src/middleware.ts"];
  const middleware = [];
  for (const candidate of middlewareCandidates) {
    if (await exists(path.join(projectRoot, ...candidate.split("/")))) middleware.push(candidate);
  }
  if (middleware.length > 0) issues.push(`存在 middleware 运行入口：${middleware.join(", ")}`);

  return createCheck(
    "conventions-legacy",
    "App 约定文件、旧入口和旧 19 个 SSR 页面",
    issues,
    `App 页面严格匹配 ${EXPECTED_APP_PAGES.size} 个新信息架构页面；基线中的 ${LEGACY_SSR_PAGE_COUNT} 个旧 SSR 页面由旧 pages/services 路径缺失和新页面允许集共同隔离。`,
  );
}

async function auditWebSources(projectRoot) {
  const issues = [];
  const sourceFiles = [];
  for (const directory of WEB_SOURCE_DIRECTORIES) {
    const absoluteDirectory = path.join(projectRoot, directory);
    for (const file of await collectFiles(absoluteDirectory)) {
      const relative = toPosix(path.relative(projectRoot, file));
      if (implementationFile(relative)) sourceFiles.push({ file, relative });
    }
  }

  for (const { file, relative } of sourceFiles) {
    const segments = relative.toLowerCase().split("/");
    const legacySegments = segments.filter((segment) => FORBIDDEN_LEGACY_PATH_SEGMENTS.has(segment.replace(/\.[^.]+$/, "")));
    if (legacySegments.length > 0) issues.push(`${relative} 使用旧互动系统路径段：${legacySegments.join(", ")}`);

    const source = await readFile(file, "utf8");
    if (/^[\t ]*["']use server["'][\t ]*;?/m.test(source)) issues.push(`${relative} 声明了 Server Action`);
    if (/\b(?:getServerSideProps|getInitialProps)\b/.test(source)) issues.push(`${relative} 包含 Pages Router 服务端数据函数`);

    for (const specifier of extractModuleSpecifiers(source)) {
      if (FORBIDDEN_MODULES.some((pattern) => pattern.test(specifier))) {
        issues.push(`${relative} 导入禁止的运行时模块：${specifier}`);
      }
    }
  }

  return createCheck(
    "web-source-boundary",
    "Web 源码导入边界与运行时 fs/content DB",
    issues,
    `仅扫描 app/components/lib 的 ${sourceFiles.length} 个非测试实现文件；按模块说明符检查，不扫描文档或测试正文。`,
  );
}

async function auditWorkerBoundary(projectRoot) {
  const issues = [];
  const workerPackagePath = path.join(projectRoot, "worker", "package.json");
  if (!(await exists(workerPackagePath))) {
    issues.push("缺少独立 worker/package.json");
  } else {
    const workerPackage = await readJson(workerPackagePath);
    if (workerPackage.private !== true) issues.push("Worker package 必须保持 private");
    if (workerPackage.type !== "module") issues.push("Worker package 未声明独立 ESM 边界");
    for (const script of ["check", "dry-run"]) {
      if (typeof workerPackage.scripts?.[script] !== "string") issues.push(`Worker 缺少独立 ${script} 脚本`);
    }
  }

  const rootPackage = await readJson(path.join(projectRoot, "package.json"));
  for (const script of ["worker:check", "worker:dry-run"]) {
    if (!/(?:npm|yarn)\s+--prefix\s+worker\s+run\s+/.test(rootPackage.scripts?.[script] ?? "")) {
      issues.push(`${script} 未通过 worker 子工程边界调用`);
    }
  }

  return createCheck(
    "worker-boundary",
    "Worker 独立工程且 Web 不导入 Worker",
    issues,
    "Worker 使用独立 package/lockfile/check/dry-run；Web 导入隔离由 web-source-boundary 同时验证。",
  );
}

async function auditStaticOutput(projectRoot) {
  const issues = [];
  const outDirectory = path.join(projectRoot, "out");
  if (!(await exists(outDirectory))) {
    return createCheck("static-output", "构建 out 为纯静态产物", ["缺少 out/，请先执行 root build"], "未发现构建产物。 ");
  }

  const outputFiles = await collectFiles(outDirectory);
  const relativeFiles = outputFiles.map((file) => toPosix(path.relative(outDirectory, file)));
  for (const required of ["index.html", "404.html", "catalog.json", "sitemap.xml", "robots.txt"]) {
    if (!relativeFiles.includes(required)) issues.push(`静态输出缺少 ${required}`);
  }

  const outputRoots = new Set(relativeFiles.map((file) => file.split("/")[0]));
  const legacyRoots = [...outputRoots].filter((root) => FORBIDDEN_LEGACY_OUTPUT_ROOTS.has(root));
  if (legacyRoots.length > 0) issues.push(`out/ 包含旧系统路由根：${legacyRoots.join(", ")}`);

  const serverArtifacts = relativeFiles.filter((file) =>
    /(?:^|\/)(?:node_modules|server|standalone)(?:\/|$)|(?:^|\/)(?:middleware|server-reference)-manifest\.json$|(?:^|\/)route\.(?:js|ts)$/.test(file),
  );
  if (serverArtifacts.length > 0) issues.push(`out/ 混入服务端产物：${serverArtifacts.join(", ")}`);

  const dynamicMarkers = relativeFiles.filter((file) =>
    !file.startsWith("_next/") && /(?:^|\/)[^/]*[\[\]][^/]*(?:\/|$)/.test(file),
  );
  if (dynamicMarkers.length > 0) issues.push(`out/ 保留未展开动态路由：${dynamicMarkers.join(", ")}`);

  const unsupportedExtensions = relativeFiles.filter((file) => {
    const extension = path.extname(file).toLowerCase();
    return extension.length > 0 && !ALLOWED_OUTPUT_EXTENSIONS.has(extension);
  });
  if (unsupportedExtensions.length > 0) issues.push(`out/ 包含非静态文件类型：${unsupportedExtensions.join(", ")}`);

  return createCheck(
    "static-output",
    "构建 out 为纯静态产物",
    issues,
    `检查 ${relativeFiles.length} 个输出文件；无旧路由根、服务端目录、运行清单或未展开动态路径。`,
  );
}

async function auditResidualAllowlist(projectRoot) {
  const issues = [];
  const residuals = [];
  for (const directory of ["data", "docs", "src"]) {
    const files = await collectFiles(path.join(projectRoot, directory));
    if (files.length > 0) residuals.push({ directory, files: files.length });
  }

  const tsconfig = await readFile(path.join(projectRoot, "tsconfig.json"), "utf8");
  const packageJson = await readJson(path.join(projectRoot, "package.json"));
  const tailwind = await readFile(path.join(projectRoot, "tailwind.config.js"), "utf8");
  if (/src\/\*\*/.test(tsconfig)) issues.push("tsconfig 仍扫描旧 src 目录");
  if (/(?:^|\s)src(?:\s|$)/.test(packageJson.scripts?.lint ?? "")) issues.push("root lint 仍扫描旧 src 目录");
  if (/['"]\.\/src\//.test(tailwind)) issues.push("Tailwind 仍扫描旧 src 目录");

  const detail = residuals.length > 0
    ? residuals.map(({ directory, files }) => `${directory}/ ${files} 个文件`).join("；")
    : "无 data/docs/src 残留";
  return createCheck(
    "residual-allowlist",
    "data/docs/旧 src 非运行残留允许集",
    issues,
    `${detail}；这些目录不在 TypeScript、ESLint、Tailwind 或 Web 导入边界内。`,
  );
}

export async function auditStaticRuntime({ projectRoot = PROJECT_ROOT } = {}) {
  const checks = [];
  for (const audit of [
    auditPackageAndConfig,
    auditConventionsAndLegacyPaths,
    auditWebSources,
    auditWorkerBoundary,
    auditStaticOutput,
    auditResidualAllowlist,
  ]) checks.push(await audit(projectRoot));

  return {
    passed: checks.every((check) => check.passed),
    checks,
    issues: checks.flatMap((check) => check.issues.map((issue) => `[${check.id}] ${issue}`)),
  };
}

export function formatAuditResult(result) {
  const lines = ["静态运行时与旧系统移除审计", ""];
  for (const check of result.checks) {
    lines.push(`${check.passed ? "PASS" : "FAIL"} ${check.id}: ${check.title}`);
    lines.push(`  ${check.evidence}`);
    for (const issue of check.issues) lines.push(`  - ${issue}`);
  }
  lines.push("", result.passed ? "审计通过。" : `审计失败，共 ${result.issues.length} 项问题。`);
  return lines.join("\n");
}

async function runCli() {
  try {
    const result = await auditStaticRuntime();
    console.log(formatAuditResult(result));
    if (!result.passed) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await runCli();
