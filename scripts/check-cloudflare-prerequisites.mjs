import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIRECTORY, "..");
const ACCOUNT_ID_PATTERN = /^[a-f0-9]{32}$/i;
const D1_ID_PATTERN = /^(?:[a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/i;
const D1_PLACEHOLDER = "REPLACE_WITH_D1_DATABASE_ID";

function requireValue(environment, name) {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`缺少部署前置配置 ${name}`);
  return value;
}

export function validateDeploymentEnvironment(target, environment = process.env) {
  if (!["worker", "pages"].includes(target)) throw new Error("部署目标必须是 worker 或 pages");
  const accountId = requireValue(environment, "CLOUDFLARE_ACCOUNT_ID");
  requireValue(environment, "CLOUDFLARE_API_TOKEN");
  if (!ACCOUNT_ID_PATTERN.test(accountId)) throw new Error("CLOUDFLARE_ACCOUNT_ID 格式无效");
  console.log(`${target} 部署前置配置已通过格式检查（未输出配置值）。`);
}

export async function assertCommittedD1DatabaseId(
  configPath = path.join(PROJECT_ROOT, "worker", "wrangler.jsonc"),
) {
  const config = JSON.parse(await readFile(configPath, "utf8"));
  const databaseId = config?.d1_databases?.[0]?.database_id;
  if (!databaseId || databaseId === D1_PLACEHOLDER || !D1_ID_PATTERN.test(databaseId)) {
    throw new Error("worker/wrangler.jsonc 必须填入真实 D1 database_id");
  }
  console.log("已确认仓库内 Wrangler 配置包含有效 D1 database_id（未输出 ID）。");
}

export async function assertHashSaltSecret(secretListPath) {
  const secrets = JSON.parse(await readFile(secretListPath, "utf8"));
  if (!Array.isArray(secrets) || !secrets.some((secret) => secret?.name === "HASH_SALT")) {
    throw new Error("Cloudflare Worker 尚未预配置 HASH_SALT secret");
  }
  console.log("已确认 Cloudflare Worker 存在 HASH_SALT secret（未读取或输出 secret 值）。");
}

async function runCli() {
  const [command, argument] = process.argv.slice(2);
  if (command === "environment") {
    validateDeploymentEnvironment(argument);
    await assertCommittedD1DatabaseId();
  } else if (command === "hash-salt") {
    if (!argument) throw new Error("hash-salt 检查缺少 secret list 文件路径");
    await assertHashSaltSecret(argument);
  } else throw new Error("用法：environment <worker|pages> 或 hash-salt <secret-list.json>");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
