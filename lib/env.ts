export const PRODUCTION_SITE_URL = "https://www.cnmcp.com";
const DEFAULT_STATS_API_URL = "https://api.cnmcp.com";
const SENSITIVE_PUBLIC_NAME = /(SECRET|TOKEN|PASSWORD|PRIVATE_KEY|HASH_SALT)/i;
const PUBLIC_ANALYTICS_TOKEN_NAME = "NEXT_PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN";
const WEB_ANALYTICS_TOKEN_PATTERN = /^[a-f0-9]{32}$/i;

type EnvironmentSource = Readonly<Record<string, string | undefined>>;

export type PublicEnvironment = Readonly<{
  siteUrl: string;
  statsApiUrl: string;
  githubRepositoryUrl?: string;
  cloudflareWebAnalyticsToken?: string;
}>;

function assertNoPublicSecrets(environment: EnvironmentSource): void {
  const exposedSecret = Object.entries(environment).find(
    ([name, value]) =>
      name.startsWith("NEXT_PUBLIC_") &&
      name !== PUBLIC_ANALYTICS_TOKEN_NAME &&
      SENSITIVE_PUBLIC_NAME.test(name) &&
      Boolean(value?.trim()),
  );

  if (exposedSecret) {
    throw new Error(
      `公开环境变量 ${exposedSecret[0]} 疑似包含服务端密钥，请改用 Worker secret。`,
    );
  }
}

function parseHttpsOrigin(name: string, value: string): string {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} 必须是合法的绝对 URL。`);
  }

  if (url.protocol !== "https:") {
    throw new Error(`${name} 必须使用 HTTPS。`);
  }

  if (url.username || url.password || url.search || url.hash) {
    throw new Error(`${name} 不得包含凭据、查询参数或片段。`);
  }

  if (url.pathname !== "/") {
    throw new Error(`${name} 必须是站点基址，不能包含路径。`);
  }

  return url.origin;
}

function parseGitHubRepositoryUrl(value: string): string {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error("NEXT_PUBLIC_GITHUB_REPOSITORY_URL 必须是合法的绝对 URL。");
  }

  const segments = url.pathname.replace(/\/$/, "").split("/").filter(Boolean);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "github.com" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    segments.length !== 2 ||
    !segments.every((segment) => /^[A-Za-z0-9_.-]+$/.test(segment))
  ) {
    throw new Error(
      "NEXT_PUBLIC_GITHUB_REPOSITORY_URL 必须是 https://github.com/<owner>/<repository> 格式。",
    );
  }

  const repository = segments[1].replace(/\.git$/i, "");
  if (!repository) {
    throw new Error("NEXT_PUBLIC_GITHUB_REPOSITORY_URL 缺少仓库名称。");
  }
  return `https://github.com/${segments[0]}/${repository}`;
}

export function readPublicEnvironment(
  environment: EnvironmentSource = process.env,
): PublicEnvironment {
  assertNoPublicSecrets(environment);
  const githubRepositoryUrl = environment.NEXT_PUBLIC_GITHUB_REPOSITORY_URL?.trim();
  const cloudflareWebAnalyticsToken = environment[PUBLIC_ANALYTICS_TOKEN_NAME]?.trim();
  if (cloudflareWebAnalyticsToken && !WEB_ANALYTICS_TOKEN_PATTERN.test(cloudflareWebAnalyticsToken)) {
    throw new Error(`${PUBLIC_ANALYTICS_TOKEN_NAME} 必须是 32 位十六进制公开站点 token。`);
  }

  return Object.freeze({
    siteUrl: parseHttpsOrigin(
      "NEXT_PUBLIC_SITE_URL",
      environment.NEXT_PUBLIC_SITE_URL?.trim() || PRODUCTION_SITE_URL,
    ),
    statsApiUrl: parseHttpsOrigin(
      "NEXT_PUBLIC_STATS_API_URL",
      environment.NEXT_PUBLIC_STATS_API_URL?.trim() || DEFAULT_STATS_API_URL,
    ),
    ...(githubRepositoryUrl
      ? { githubRepositoryUrl: parseGitHubRepositoryUrl(githubRepositoryUrl) }
      : {}),
    ...(cloudflareWebAnalyticsToken ? { cloudflareWebAnalyticsToken } : {}),
  });
}

export const publicEnvironment = readPublicEnvironment();
