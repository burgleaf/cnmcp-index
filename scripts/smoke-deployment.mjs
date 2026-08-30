import { randomInt, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIRECTORY, "..");
const REQUEST_TIMEOUT_MS = 15_000;

function parseOrigin(name, value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} 必须是合法绝对 URL`);
  }
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error(`${name} 必须是无路径、凭据、查询参数和片段的 HTTPS Origin`);
  }
  return url.origin;
}

function assertCatalog(catalog) {
  if (!catalog || !Array.isArray(catalog.resources) || !catalog.indexes || !Array.isArray(catalog.platforms)) {
    throw new Error("烟雾检查 Catalog 结构无效");
  }
}

export function createPagesSmokePaths(catalog, resourceIndex) {
  assertCatalog(catalog);
  const kinds = Object.keys(catalog.indexes.kinds ?? {}).sort();
  const platforms = catalog.platforms.filter((platform) => platform?.enabled === true).map((platform) => platform.id).sort();
  const paths = [
    "/",
    "/resources/",
    ...kinds.map((kind) => `/category/${encodeURIComponent(kind)}/`),
    ...platforms.map((platform) => `/platform/${encodeURIComponent(platform)}/`),
    "/sitemap.xml",
    "/robots.txt",
  ];
  if (catalog.resources.length > 0) {
    const index = resourceIndex ?? randomInt(catalog.resources.length);
    if (!Number.isInteger(index) || index < 0 || index >= catalog.resources.length) throw new Error("资源抽样索引无效");
    const id = catalog.resources[index]?.id;
    if (typeof id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw new Error("资源 ID 无效");
    paths.push(`/resources/${encodeURIComponent(id)}/`);
  }
  return paths;
}

async function request(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, redirect: "follow", signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function expectStatus(baseUrl, pathname, expectedStatus, options) {
  const response = await request(new URL(pathname, baseUrl), options);
  console.log(`${options?.method ?? "GET"} ${pathname} -> ${response.status}`);
  if (response.status !== expectedStatus) throw new Error(`${pathname} 预期 HTTP ${expectedStatus}，实际 ${response.status}`);
  return response;
}

function expectNoStore(response, label) {
  if (response.headers.get("Cache-Control")?.toLowerCase() !== "no-store") {
    throw new Error(`${label} 缺少 Cache-Control: no-store`);
  }
}

export async function smokePages({ baseUrl, catalogPath = path.join(PROJECT_ROOT, ".generated", "resources.generated.json") }) {
  const origin = parseOrigin("Pages deployment URL", baseUrl);
  const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
  for (const pathname of createPagesSmokePaths(catalog)) await expectStatus(origin, pathname, 200);
  await expectStatus(origin, `/__cnmcp-smoke-missing-${randomUUID()}/`, 404);
}

export async function smokeWorker({ baseUrl, origin }) {
  const apiOrigin = parseOrigin("Worker API URL", baseUrl);
  const allowedOrigin = parseOrigin("生产站点 Origin", origin);

  const stats = await expectStatus(apiOrigin, "/v1/stats", 200);
  expectNoStore(stats, "GET /v1/stats");

  const cors = await expectStatus(apiOrigin, "/v1/stats", 200, { headers: { Origin: allowedOrigin } });
  expectNoStore(cors, "CORS GET /v1/stats");
  if (cors.headers.get("Access-Control-Allow-Origin") !== allowedOrigin) throw new Error("允许 Origin 的 CORS 响应头不匹配");

  const forbidden = await expectStatus(apiOrigin, "/v1/stats", 403, { headers: { Origin: "https://invalid.example" } });
  expectNoStore(forbidden, "拒绝 Origin");

  const unknownRoute = await expectStatus(apiOrigin, `/v1/unknown-${randomUUID()}`, 404);
  expectNoStore(unknownRoute, "未知路由");

  const unknownResource = await expectStatus(apiOrigin, "/v1/events", 404, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: allowedOrigin },
    body: JSON.stringify({
      resourceId: `smoke-unknown-${randomUUID()}`,
      eventType: "source_visit",
      eventId: randomUUID(),
    }),
  });
  expectNoStore(unknownResource, "未知资源");
  const payload = await unknownResource.json();
  if (payload?.error?.code !== "RESOURCE_NOT_FOUND") throw new Error("未知资源错误协议不匹配");
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!["--target", "--base-url", "--origin", "--catalog"].includes(argument)) throw new Error(`未知参数：${argument}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${argument} 缺少值`);
    options[argument.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
    index += 1;
  }
  return options;
}

async function runCli() {
  const options = parseArguments(process.argv.slice(2));
  if (options.target === "pages") await smokePages({ baseUrl: options.baseUrl, catalogPath: options.catalog });
  else if (options.target === "worker") await smokeWorker({ baseUrl: options.baseUrl, origin: options.origin });
  else throw new Error("--target 必须是 pages 或 worker");
  console.log(`${options.target} 烟雾检查通过。`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
