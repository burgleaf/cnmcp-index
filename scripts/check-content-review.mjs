import { appendFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const MAINTAINER_PERMISSIONS = new Set(["admin", "maintain", "write"]);
const RESOURCE_FILE_PATTERN = /^resources\/[^/]+\/resource\.json$/;

export function isProtectedContentPath(filePath) {
  return (
    filePath.startsWith("resources/") ||
    filePath === "catalog/platforms.json" ||
    filePath === "catalog/tags.json" ||
    filePath.startsWith("schemas/")
  );
}

export function detectFeaturedChange(filePath, before, after) {
  if (!RESOURCE_FILE_PATTERN.test(filePath)) return null;
  const beforeFeatured = before?.featured === true;
  const afterFeatured = after?.featured === true;
  if (beforeFeatured === afterFeatured) return null;
  return Object.freeze({ filePath, before: beforeFeatured, after: afterFeatured });
}

export function hasCurrentMaintainerApproval(reviews, headSha, permissions) {
  const latestStates = new Map();
  for (const review of reviews) {
    const login = review.user?.login;
    if (!login || review.commit_id !== headSha) continue;
    if (!["APPROVED", "CHANGES_REQUESTED", "DISMISSED"].includes(review.state)) continue;
    latestStates.set(login, review.state);
  }
  return [...latestStates].some(
    ([login, state]) => state === "APPROVED" && MAINTAINER_PERMISSIONS.has(permissions[login]),
  );
}

function encodeRepositoryPath(filePath) {
  return filePath.split("/").map(encodeURIComponent).join("/");
}

async function requestJson(apiUrl, token, pathname, { allowNotFound = false } = {}) {
  const response = await fetch(`${apiUrl}${pathname}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "cnmcp-content-review",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (allowNotFound && response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`GitHub API ${pathname} 返回 ${response.status}`);
  }
  return response.json();
}

async function requestAllPages(apiUrl, token, pathname) {
  const results = [];
  for (let page = 1; ; page += 1) {
    const separator = pathname.includes("?") ? "&" : "?";
    const batch = await requestJson(apiUrl, token, `${pathname}${separator}per_page=100&page=${page}`);
    results.push(...batch);
    if (batch.length < 100) return results;
  }
}

async function readRepositoryJson(apiUrl, token, repository, filePath, ref) {
  const result = await requestJson(
    apiUrl,
    token,
    `/repos/${repository}/contents/${encodeRepositoryPath(filePath)}?ref=${encodeURIComponent(ref)}`,
    { allowNotFound: true },
  );
  if (!result || Array.isArray(result) || result.type !== "file" || !result.content) return null;
  return JSON.parse(Buffer.from(result.content, "base64").toString("utf8"));
}

async function writeSummary(lines) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) await appendFile(summaryPath, `${lines.join("\n")}\n`, "utf8");
}

export async function runContentReviewCheck(environment = process.env) {
  const eventPath = environment.GITHUB_EVENT_PATH;
  const token = environment.GITHUB_TOKEN;
  const apiUrl = environment.GITHUB_API_URL ?? "https://api.github.com";
  if (!eventPath || !token) throw new Error("缺少 GITHUB_EVENT_PATH 或 GITHUB_TOKEN");

  const event = JSON.parse(await readFile(eventPath, "utf8"));
  const pullRequest = event.pull_request;
  if (!pullRequest) throw new Error("当前事件不包含 pull_request");

  const baseRepository = pullRequest.base.repo.full_name;
  const headRepository = pullRequest.head.repo.full_name;
  const pullNumber = pullRequest.number;
  const files = await requestAllPages(
    apiUrl,
    token,
    `/repos/${baseRepository}/pulls/${pullNumber}/files`,
  );
  const protectedFiles = files.map((file) => file.filename).filter(isProtectedContentPath);
  const featuredChanges = [];

  for (const filePath of protectedFiles.filter((entry) => RESOURCE_FILE_PATTERN.test(entry))) {
    try {
      const [before, after] = await Promise.all([
        readRepositoryJson(apiUrl, token, baseRepository, filePath, pullRequest.base.sha),
        readRepositoryJson(apiUrl, token, headRepository, filePath, pullRequest.head.sha),
      ]);
      const change = detectFeaturedChange(filePath, before, after);
      if (change) featuredChanges.push(change);
    } catch (error) {
      console.warn(`无法解析 ${filePath} 的 featured 变化：${error.message}`);
    }
  }

  const lines = ["## 内容审核边界"];
  if (featuredChanges.length) {
    lines.push("", "### ⚠️ featured 变化");
    for (const change of featuredChanges) {
      lines.push(`- \`${change.filePath}\`: \`${change.before}\` → \`${change.after}\``);
      console.log(`[featured] ${change.filePath}: ${change.before} -> ${change.after}`);
    }
  } else {
    lines.push("", "未检测到 `featured` 值变化。");
    console.log("未检测到 featured 值变化。");
  }

  if (!protectedFiles.length) {
    lines.push("", "本 PR 未修改受保护的内容路径，无需内容维护者批准。");
    await writeSummary(lines);
    return { protectedFiles, featuredChanges, approved: true };
  }

  lines.push("", "### 受保护路径", ...protectedFiles.map((filePath) => `- \`${filePath}\``));
  const reviews = await requestAllPages(
    apiUrl,
    token,
    `/repos/${baseRepository}/pulls/${pullNumber}/reviews`,
  );
  const currentApprovers = [...new Set(
    reviews
      .filter((review) => review.state === "APPROVED" && review.commit_id === pullRequest.head.sha)
      .map((review) => review.user?.login)
      .filter(Boolean),
  )];
  const permissions = {};
  for (const login of currentApprovers) {
    const permission = await requestJson(
      apiUrl,
      token,
      `/repos/${baseRepository}/collaborators/${encodeURIComponent(login)}/permission`,
      { allowNotFound: true },
    );
    if (permission?.permission) permissions[login] = permission.permission;
  }

  const approved = hasCurrentMaintainerApproval(reviews, pullRequest.head.sha, permissions);
  lines.push(
    "",
    approved
      ? "✅ 当前提交已获得具有 write/maintain/admin 权限的维护者批准。"
      : "❌ 当前提交尚未获得具有 write/maintain/admin 权限的维护者批准。",
  );
  await writeSummary(lines);
  if (!approved) {
    throw new Error("受保护内容必须由具有 write、maintain 或 admin 权限的维护者批准当前提交");
  }
  return { protectedFiles, featuredChanges, approved };
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  try {
    await runContentReviewCheck();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
