export const GITHUB_API = "https://api.github.com";
export const GITHUB_API_VERSION = "2022-11-28";
export const USER_AGENT = "cnmcp-discovery/0.1";

export type GithubRepoRef = Readonly<{
  owner: string;
  repo: string;
  fullName: string;
  htmlUrl: string;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseGithubRepo(value: string | undefined | null): GithubRepoRef | null {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    const normalized = trimmed
      .replace(/^git\+/, "")
      .replace(/^ssh:\/\/git@github\.com\//i, "https://github.com/")
      .replace(/^git@github\.com:/i, "https://github.com/");
    url = new URL(normalized);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.hostname.toLowerCase() !== "github.com") return null;
  const segments = url.pathname.replace(/\/+$/, "").replace(/\.git$/i, "").split("/").filter(Boolean);
  if (segments.length < 2) return null;
  const owner = segments[0];
  const repo = segments[1].replace(/\.git$/i, "");
  if (!owner || !repo || owner === "." || repo === ".") return null;
  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) return null;
  const fullName = `${owner}/${repo}`.toLowerCase();
  return {
    owner,
    repo,
    fullName,
    htmlUrl: `https://github.com/${owner}/${repo}`,
  };
}

export function normalizeSourceUrl(value: string): string | null {
  try {
    const url = new URL(value);
    url.protocol = "https:";
    url.username = "";
    url.password = "";
    url.hostname = url.hostname.toLowerCase();
    url.port = url.port === "443" ? "" : url.port;
    url.hash = "";
    url.search = "";
    let pathname = url.pathname.replace(/\/+$/, "").replace(/\.git$/i, "");
    if (["github.com", "gitlab.com", "bitbucket.org"].includes(url.hostname)) pathname = pathname.toLowerCase();
    url.pathname = pathname || "/";
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function githubHeaders(token: string | undefined): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": USER_AGENT,
    "X-GitHub-Api-Version": GITHUB_API_VERSION,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export function asNonNegativeInteger(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return Math.floor(value);
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return fallback;
}

export function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function readRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

export function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string" && item.trim().length > 0))];
}
