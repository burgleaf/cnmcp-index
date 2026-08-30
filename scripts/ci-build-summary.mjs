import { appendFile, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIRECTORY, "..");
const RESOURCE_KINDS = ["mcp", "skill", "plugin"];
const PLATFORM_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

async function countRoutes(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") throw new Error(`静态输出目录不存在：${directory}`);
    throw error;
  }

  let count = 0;
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) count += await countRoutes(entryPath);
    else if (entry.isFile() && (entry.name.endsWith(".html") || entry.name === "sitemap.xml" || entry.name === "robots.txt")) count += 1;
  }
  return count;
}

export function createBuildSummary(catalog, routeCount) {
  if (!catalog || !Array.isArray(catalog.resources) || !Array.isArray(catalog.platforms)) {
    throw new Error("生成 Catalog 结构无效");
  }
  if (!Number.isSafeInteger(routeCount) || routeCount < 0) throw new Error("生成路由数量无效");

  const kindCounts = Object.fromEntries(RESOURCE_KINDS.map((kind) => [kind, 0]));
  for (const resource of catalog.resources) {
    if (!resource || typeof resource !== "object" || !RESOURCE_KINDS.includes(resource.kind)) {
      throw new Error("Catalog 包含未知资源类型");
    }
    kindCounts[resource.kind] += 1;
  }

  const enabledPlatforms = catalog.platforms
    .filter((platform) => platform?.enabled === true)
    .map((platform) => platform.id);
  if (enabledPlatforms.some((id) => typeof id !== "string" || !PLATFORM_ID_PATTERN.test(id))) {
    throw new Error("Catalog 包含不安全的平台 ID");
  }

  return [
    "## 静态构建摘要",
    `- 资源总数：${catalog.resources.length}`,
    ...RESOURCE_KINDS.map((kind) => `- ${kind} 数量：${kindCounts[kind]}`),
    `- 启用平台：${enabledPlatforms.sort().join(", ") || "无"}`,
    `- 生成路由数量：${routeCount}`,
  ].join("\n");
}

export async function generateBuildSummary({
  catalogPath = path.join(PROJECT_ROOT, ".generated", "resources.generated.json"),
  outputDirectory = path.join(PROJECT_ROOT, "out"),
  summaryPath = process.env.GITHUB_STEP_SUMMARY,
} = {}) {
  const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
  const summary = createBuildSummary(catalog, await countRoutes(outputDirectory));
  if (summaryPath) await appendFile(summaryPath, `${summary}\n`, "utf8");
  else console.log(summary);
  return summary;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  generateBuildSummary().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
