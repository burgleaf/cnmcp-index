import type { ResourceKind } from "./classify";
import { GITHUB_API, githubHeaders, parseGithubRepo } from "./github";
import type { StoredCandidate } from "./types";
import type { FetchLike } from "./sources/mcp-registry";

const KIND_LABELS: Readonly<Record<ResourceKind, string>> = {
  mcp: "MCP",
  skill: "Skill",
  plugin: "AI 编程工具插件",
};

export function buildPromotionIssue(candidate: StoredCandidate): { title: string; body: string; labels: string[] } {
  const kindLabel = KIND_LABELS[candidate.kind] ?? candidate.kind;
  const platforms = candidate.inferredPlatforms.length > 0 ? candidate.inferredPlatforms.join("、") : "待人工确认";
  const license = candidate.license ?? "未知，需人工核验 SPDX";
  const summary = candidate.description.trim() || "（GitHub 无 description，需维护者补写中文摘要）";
  const title = `[自动发现] ${candidate.name} (${candidate.repoFullName})`.slice(0, 200);
  const body = [
    "## 自动发现候选",
    "",
    "该 Issue 由发现爬虫创建，**不是**已审核 Catalog 条目。请人工核验兼容性、安装命令和中文摘要后再提交 `resource.json`。",
    "",
    "### 资源类型",
    kindLabel,
    "",
    "### 源码地址",
    candidate.htmlUrl,
    "",
    "### 中文摘要",
    "（草稿，来自 GitHub description，需维护者改写）",
    "",
    summary.slice(0, 300),
    "",
    "### 开源许可证",
    license,
    "",
    "### 平台兼容性",
    `推断平台：${platforms}`,
    "compatibility.status: unknown",
    "安装命令未抓取。站点、CI 和审核流程都不会执行第三方命令。",
    "",
    "### 热度信号",
    `- stars: ${candidate.stars}`,
    `- score: ${candidate.score.toFixed(2)}`,
    `- kind: ${candidate.kind}`,
    "",
    "请勿直接合并进 `resources/`。确认后使用投稿 Issue Form 或 Pull Request。",
  ].join("\n");
  return { title, body, labels: ["auto-discovery"] };
}

export async function createGithubIssue(
  fetchImpl: FetchLike,
  token: string,
  catalogRepository: string,
  candidate: StoredCandidate,
): Promise<number | null> {
  const parsed = parseGithubRepo(`https://github.com/${catalogRepository}`);
  if (!parsed) return null;
  const issue = buildPromotionIssue(candidate);
  const response = await fetchImpl(`${GITHUB_API}/repos/${parsed.owner}/${parsed.repo}/issues`, {
    method: "POST",
    headers: {
      ...githubHeaders(token),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: issue.title,
      body: issue.body,
      labels: issue.labels,
    }),
  });
  if (response.status === 422) {
    const retry = await fetchImpl(`${GITHUB_API}/repos/${parsed.owner}/${parsed.repo}/issues`, {
      method: "POST",
      headers: {
        ...githubHeaders(token),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title: issue.title, body: issue.body }),
    });
    if (!retry.ok) return null;
    const payload = (await retry.json()) as { number?: unknown };
    return typeof payload.number === "number" ? payload.number : null;
  }
  if (!response.ok) return null;
  const payload = (await response.json()) as { number?: unknown };
  return typeof payload.number === "number" ? payload.number : null;
}
