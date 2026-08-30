import { chmod, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIRECTORY, "..");
const D1_ID_PATTERN = /^(?:[a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/i;

export function createProductionWranglerConfig(config, databaseId, configDirectory = path.join(PROJECT_ROOT, "worker")) {
  if (!D1_ID_PATTERN.test(databaseId ?? "")) throw new Error("CLOUDFLARE_D1_DATABASE_ID 格式无效");
  if (!config || !Array.isArray(config.d1_databases) || config.d1_databases.length !== 1) {
    throw new Error("Wrangler 配置必须包含且仅包含一个 D1 binding");
  }
  const database = config.d1_databases[0];
  if (database.binding !== "DB") throw new Error("Wrangler D1 binding 必须命名为 DB");
  return {
    ...config,
    ...(typeof config.main === "string" ? { main: path.resolve(configDirectory, config.main) } : {}),
    d1_databases: [{
      ...database,
      database_id: databaseId,
      ...(typeof database.migrations_dir === "string"
        ? { migrations_dir: path.resolve(configDirectory, database.migrations_dir) }
        : {}),
    }],
  };
}

function assertOutputInsideRunnerTemp(outputPath, runnerTemp) {
  const absoluteOutput = path.resolve(outputPath);
  const absoluteTemp = path.resolve(runnerTemp);
  const relative = path.relative(absoluteTemp, absoluteOutput);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("WRANGLER_CONFIG_OUTPUT 必须位于 RUNNER_TEMP 内");
  }
  return absoluteOutput;
}

export async function prepareWranglerConfig({
  inputPath = path.join(PROJECT_ROOT, "worker", "wrangler.jsonc"),
  databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID,
  outputPath = process.env.WRANGLER_CONFIG_OUTPUT,
  runnerTemp = process.env.RUNNER_TEMP,
} = {}) {
  if (!outputPath || !runnerTemp) throw new Error("缺少 WRANGLER_CONFIG_OUTPUT 或 RUNNER_TEMP");
  const safeOutputPath = assertOutputInsideRunnerTemp(outputPath, runnerTemp);
  const config = JSON.parse(await readFile(inputPath, "utf8"));
  await writeFile(safeOutputPath, `${JSON.stringify(createProductionWranglerConfig(config, databaseId, path.dirname(inputPath)), null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx",
  });
  await chmod(safeOutputPath, 0o600);
  console.log("已生成临时生产 Wrangler 配置（未输出数据库 ID）。");
  return safeOutputPath;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  prepareWranglerConfig().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
