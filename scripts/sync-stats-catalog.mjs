import { spawn } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createCatalogSyncSql, getPublicResourceIds } from "./lib/stats-catalog-sync.mjs";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIRECTORY, "..");

export { createCatalogSyncSql, getPublicResourceIds };

export function runProcess(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, shell: false, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`Wrangler 同步失败（code=${code ?? "null"}, signal=${signal ?? "none"}）。`));
    });
  });
}

export async function runWranglerCatalogSync(options = {}) {
  const projectRoot = path.resolve(options.projectRoot ?? PROJECT_ROOT);
  const workerDirectory = path.join(projectRoot, "worker");
  const catalogPath = path.resolve(options.catalogPath ?? path.join(projectRoot, ".generated", "resources.generated.json"));
  const configPath = path.resolve(options.configPath ?? path.join(workerDirectory, "wrangler.jsonc"));
  const databaseName = options.databaseName ?? "cnmcp-stats";
  const syncedAt = options.syncedAt ?? Date.now();
  const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
  const ids = getPublicResourceIds(catalog);
  const sql = createCatalogSyncSql(catalog, syncedAt);
  const temporarySqlPath = path.join(os.tmpdir(), `cnmcp-stats-sync-${randomUUID()}.sql`);
  const wranglerEntry = path.join(workerDirectory, "node_modules", "wrangler", "bin", "wrangler.js");
  const args = [
    wranglerEntry,
    "d1",
    "execute",
    databaseName,
    "--config",
    configPath,
    "--file",
    temporarySqlPath,
    options.remote ? "--remote" : "--local",
  ];

  try {
    await writeFile(temporarySqlPath, sql, { encoding: "utf8", flag: "wx" });
    await (options.runner ?? runProcess)(process.execPath, args, { cwd: workerDirectory });
  } finally {
    await rm(temporarySqlPath, { force: true });
  }
  return { resourceCount: ids.length, mode: options.remote ? "remote" : "local" };
}

function parseArguments(argv) {
  const options = { remote: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--remote") options.remote = true;
    else if (argument === "--local") options.remote = false;
    else if (argument === "--catalog") options.catalogPath = argv[++index];
    else if (argument === "--database") options.databaseName = argv[++index];
    else if (argument === "--config") options.configPath = argv[++index];
    else throw new Error(`未知参数：${argument}`);
  }
  return options;
}

async function runCli() {
  const result = await runWranglerCatalogSync(parseArguments(process.argv.slice(2)));
  console.log(`D1 Catalog 本地/远程模式=${result.mode}，已同步 ${result.resourceCount} 个公开资源。`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
