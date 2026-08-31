import { appendFile, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const UNIQUE_DEPLOYMENT_HOST = /^[a-f0-9]{8}\./i;

export function extractPagesDeploymentUrl(log) {
  const matches = log.match(/https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.pages\.dev\/?/gi) ?? [];
  const origins = [];
  for (const match of matches) {
    const url = new URL(match);
    if (url.protocol !== "https:" || !url.hostname.endsWith(".pages.dev") || url.username || url.password) {
      throw new Error("Pages deployment URL 格式无效");
    }
    if (!origins.includes(url.origin)) origins.push(url.origin);
  }
  if (!origins.length) throw new Error("Wrangler 输出中没有找到 Pages deployment URL");
  return origins.find((origin) => UNIQUE_DEPLOYMENT_HOST.test(new URL(origin).hostname)) ?? origins.at(-1);
}

async function runCli() {
  const logPath = process.argv[2];
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!logPath || !outputPath) throw new Error("缺少部署日志路径或 GITHUB_OUTPUT");
  const url = extractPagesDeploymentUrl(await readFile(logPath, "utf8"));
  await appendFile(outputPath, `url=${url}\n`, "utf8");
  console.log("已提取并校验 Pages deployment URL。");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
