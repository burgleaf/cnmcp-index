import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HTTPS_ORIGIN_NAMES = new Set(["WORKER_API_URL", "PRODUCTION_SITE_URL"]);
const PROJECT_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,56}[a-z0-9])?$/;
const ACCOUNT_ID_PATTERN = /^[a-f0-9]{32}$/i;

function requireValue(environment, name) {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`缺少部署前置配置 ${name}`);
  return value;
}

function validateHttpsOrigin(name, value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error(`${name} 必须是无路径、凭据、查询参数和片段的 HTTPS Origin`);
  }
}

export function validateDeploymentEnvironment(target, environment = process.env) {
  if (!["worker", "pages"].includes(target)) throw new Error("部署目标必须是 worker 或 pages");
  const accountId = requireValue(environment, "CLOUDFLARE_ACCOUNT_ID");
  requireValue(environment, "CLOUDFLARE_API_TOKEN");
  requireValue(environment, "CLOUDFLARE_D1_DATABASE_ID");
  if (!ACCOUNT_ID_PATTERN.test(accountId)) throw new Error("CLOUDFLARE_ACCOUNT_ID 格式无效");

  const names = target === "worker"
    ? ["WORKER_API_URL", "PRODUCTION_SITE_URL"]
    : ["CLOUDFLARE_PAGES_PROJECT", "PRODUCTION_SITE_URL", "WORKER_API_URL"];
  for (const name of names) {
    const value = requireValue(environment, name);
    if (HTTPS_ORIGIN_NAMES.has(name)) validateHttpsOrigin(name, value);
    if (name === "CLOUDFLARE_PAGES_PROJECT" && !PROJECT_PATTERN.test(value)) {
      throw new Error("CLOUDFLARE_PAGES_PROJECT 格式无效");
    }
  }
  console.log(`${target} 部署前置配置已通过格式检查（未输出配置值）。`);
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
  if (command === "environment") validateDeploymentEnvironment(argument);
  else if (command === "hash-salt") {
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
