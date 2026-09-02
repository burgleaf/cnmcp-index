const GITHUB_API = "https://api.github.com";
const API_VERSION = "2022-11-28";
const COMMENT_MARKER = "<!-- cnmcp-flow: ai-review";

function assertRepository(repository) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error("Invalid GitHub repository slug");
}

function headers(token, write = false) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "User-Agent": "cnmcp-ai-review/1.0",
    "X-GitHub-Api-Version": API_VERSION,
    ...(write ? { "Content-Type": "application/json" } : {}),
  };
}

async function githubRequest(fetchImpl, token, path, init = {}) {
  const response = await fetchImpl(`${GITHUB_API}${path}`, {
    ...init,
    redirect: "error",
    headers: { ...headers(token, Boolean(init.body)), ...(init.headers ?? {}) },
  });
  if (!response.ok) throw new Error(`GitHub API request failed: HTTP ${response.status}`);
  return await response.json();
}

function decodeContent(payload, maxBytes) {
  if (!payload || payload.encoding !== "base64" || typeof payload.content !== "string") return "";
  const content = Buffer.from(payload.content.replace(/\n/g, ""), "base64");
  if (content.byteLength > maxBytes) return content.subarray(0, maxBytes).toString("utf8");
  return content.toString("utf8");
}

export async function getIssue({ fetchImpl = globalThis.fetch, token, repository, issueNumber }) {
  assertRepository(repository);
  const payload = await githubRequest(fetchImpl, token, `/repos/${repository}/issues/${issueNumber}`);
  if (typeof payload.body !== "string") throw new Error("Candidate Issue has no body");
  return { number: payload.number, title: payload.title ?? "", body: payload.body, labels: payload.labels ?? [] };
}

export async function readCandidateSources({ fetchImpl = globalThis.fetch, token, repoFullName }) {
  assertRepository(repoFullName);
  const repo = await githubRequest(fetchImpl, token, `/repos/${repoFullName}`);
  const readme = await githubRequest(fetchImpl, token, `/repos/${repoFullName}/readme`).catch(() => null);
  const licenseFile = await githubRequest(fetchImpl, token, `/repos/${repoFullName}/license`).catch(() => null);
  return {
    repository: {
      fullName: String(repo.full_name ?? repoFullName).toLowerCase(),
      htmlUrl: repo.html_url,
      description: repo.description ?? "",
      archived: Boolean(repo.archived),
      stars: Number.isFinite(repo.stargazers_count) ? repo.stargazers_count : 0,
      forks: Number.isFinite(repo.forks_count) ? repo.forks_count : 0,
      pushedAt: repo.pushed_at ?? null,
      defaultBranch: repo.default_branch ?? null,
      license: repo.license?.spdx_id ?? null,
      evidenceUrl: `${GITHUB_API}/repos/${repoFullName}`,
    },
    readme: decodeContent(readme, 100_000),
    licenseText: decodeContent(licenseFile, 50_000),
  };
}

export async function findReviewComment({ fetchImpl = globalThis.fetch, token, repository, issueNumber }) {
  assertRepository(repository);
  const comments = await githubRequest(fetchImpl, token, `/repos/${repository}/issues/${issueNumber}/comments?per_page=100`);
  if (!Array.isArray(comments)) return null;
  return comments.find((comment) => typeof comment.body === "string" && comment.body.startsWith(COMMENT_MARKER)) ?? null;
}

export function commentHasFingerprint(comment, fingerprint) {
  return Boolean(comment?.body?.startsWith(`<!-- cnmcp-flow: ai-review fingerprint: ${fingerprint} -->`));
}

export async function upsertReviewComment({ fetchImpl = globalThis.fetch, token, repository, issueNumber, body }) {
  assertRepository(repository);
  const comments = await githubRequest(fetchImpl, token, `/repos/${repository}/issues/${issueNumber}/comments`);
  const existing = Array.isArray(comments)
    ? comments.find((comment) => typeof comment.body === "string" && comment.body.startsWith(COMMENT_MARKER))
    : null;
  if (existing && existing.body === body) return { action: "unchanged", commentId: existing.id };
  if (existing) {
    await githubRequest(fetchImpl, token, `/repos/${repository}/issues/comments/${existing.id}`, {
      method: "PATCH",
      body: JSON.stringify({ body }),
    });
    return { action: "updated", commentId: existing.id };
  }
  const created = await githubRequest(fetchImpl, token, `/repos/${repository}/issues/${issueNumber}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
  return { action: "created", commentId: created.id };
}
