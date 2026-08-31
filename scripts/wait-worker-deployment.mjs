import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WORKER_PATHS = [
  /^worker\//,
  /^scripts\/(?:sync-stats-catalog|check-cloudflare-prerequisites|smoke-deployment)\.mjs$/,
  /^scripts\/lib\/stats-catalog-sync\.mjs$/,
  /^\.github\/workflows\/deploy-worker\.yml$/,
];

export function requiresWorkerDeployment(files) {
  if (!Array.isArray(files)) throw new Error("变更文件列表无效");
  return files.some((file) => typeof file === "string" && WORKER_PATHS.some((pattern) => pattern.test(file)));
}

export function skipsWorkerDeploymentGate(eventName) {
  return eventName === "workflow_dispatch";
}

async function githubJson(pathname, environment) {
  const response = await fetch(`${environment.GITHUB_API_URL ?? "https://api.github.com"}${pathname}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${environment.GITHUB_TOKEN}`,
      "User-Agent": "cnmcp-worker-deployment-gate",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!response.ok) throw new Error(`GitHub API 请求失败：${response.status}`);
  return response.json();
}

async function changedFiles(event, environment) {
  const repository = environment.GITHUB_REPOSITORY;
  const before = event.before;
  const after = event.after;
  if (!repository || !after) throw new Error("缺少 GitHub repository 或 push SHA");
  if (before && !/^0+$/.test(before)) {
    const comparison = await githubJson(`/repos/${repository}/compare/${before}...${after}`, environment);
    if (!Array.isArray(comparison.files)) throw new Error("GitHub compare 响应缺少 files");
    return comparison.files.map((file) => file.filename);
  }
  const commit = await githubJson(`/repos/${repository}/commits/${after}`, environment);
  if (!Array.isArray(commit.files)) throw new Error("GitHub commit 响应缺少 files");
  return commit.files.map((file) => file.filename);
}

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function waitForWorkerDeployment(environment = process.env, options = {}) {
  if (skipsWorkerDeploymentGate(environment.GITHUB_EVENT_NAME)) {
    console.log("手动触发的 Pages 发布不要求同一提交的 Worker 工作流。");
    return { required: false };
  }

  const event = JSON.parse(await readFile(environment.GITHUB_EVENT_PATH, "utf8"));
  const files = await changedFiles(event, environment);
  if (!requiresWorkerDeployment(files)) {
    console.log("本次提交未修改 Worker 生产依赖路径，安全门无需等待 Worker 部署。");
    return { required: false };
  }

  const attempts = options.attempts ?? 60;
  const intervalMs = options.intervalMs ?? 30_000;
  const workflow = encodeURIComponent("deploy-worker.yml");
  const sha = encodeURIComponent(event.after);
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const result = await githubJson(
      `/repos/${environment.GITHUB_REPOSITORY}/actions/workflows/${workflow}/runs?event=push&head_sha=${sha}&per_page=10`,
      environment,
    );
    const run = Array.isArray(result.workflow_runs) ? result.workflow_runs[0] : undefined;
    if (run?.status === "completed") {
      if (run.conclusion === "success") {
        console.log("同一提交的 Worker 生产工作流已成功，Pages 可以继续。");
        return { required: true, runId: run.id };
      }
      throw new Error(`同一提交的 Worker 生产工作流未成功：${run.conclusion ?? "unknown"}`);
    }
    if (attempt < attempts) await sleep(intervalMs);
  }
  throw new Error("等待同一提交的 Worker 生产工作流超时");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  waitForWorkerDeployment().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
