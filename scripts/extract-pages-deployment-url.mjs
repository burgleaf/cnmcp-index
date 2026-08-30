import { appendFile, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function extractPagesDeploymentUrl(log) {
  const matches = log.match(/https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.pages\.dev\/?/gi) ?? [];
  if (!matches.length) throw new Error("Wrangler 输出中没有找到 Pages deployment URL");
  const url = new URL(matches.at(-1));
  if (url.protocol !== "https:" || !url.hostname.endsWith(".pages.dev") || url.username || url.password) {
    throw new Error("Pages deployment URL 格式无效");
  }
  return url.origin;
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
