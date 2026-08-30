import { access, readFile, rename } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIRECTORY, "..");

async function exists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readGeneratedResources(projectRoot) {
  const catalogPath = path.join(projectRoot, ".generated", "resources.generated.json");
  const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
  if (!Array.isArray(catalog.resources)) throw new Error("生成 Catalog 缺少 resources 数组");
  return catalog.resources;
}

export async function runStaticBuild({ projectRoot = PROJECT_ROOT, runBuild }) {
  const routeDirectory = path.join(projectRoot, "app", "resources", "[id]");
  const backupDirectory = path.join(projectRoot, ".generated", ".resource-detail-route-backup");

  if (await exists(backupDirectory)) {
    if (await exists(routeDirectory)) throw new Error("资源详情路由与构建恢复目录同时存在，请人工检查");
    await rename(backupDirectory, routeDirectory);
  }

  const resources = await readGeneratedResources(projectRoot);
  if (resources.length > 0) return runBuild();
  if (!(await exists(routeDirectory))) return runBuild();

  console.log("正式 Catalog 为空：静态构建期间不注册资源详情动态路由，避免生成伪资源 URL。");
  await rename(routeDirectory, backupDirectory);
  try {
    return await runBuild();
  } finally {
    await rename(backupDirectory, routeDirectory);
  }
}

function runNextBuild() {
  const nextCli = path.join(PROJECT_ROOT, "node_modules", "next", "dist", "bin", "next");
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [nextCli, "build"], {
      cwd: PROJECT_ROOT,
      stdio: "inherit",
      env: process.env,
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) reject(new Error(`Next 静态构建被信号 ${signal} 终止`));
      else if (code === 0) resolve();
      else reject(new Error(`Next 静态构建失败，退出码 ${code}`));
    });
  });
}

async function runCli() {
  try {
    await runStaticBuild({ runBuild: runNextBuild });
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await runCli();
