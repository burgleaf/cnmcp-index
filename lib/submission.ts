export const PRODUCTION_CATALOG_REPOSITORY_URL = "https://github.com/burgleaf/cnmcp-index";
export const SUBMIT_RESOURCE_SKILL_PATH = ".agents/skills/submit-cnmcp-resource/SKILL.md";

const GITHUB_OWNER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;
const GITHUB_REPO_PATTERN = /^[A-Za-z0-9_.-]+$/;
const RESERVED_GITHUB_OWNERS = new Set([
  "about",
  "apps",
  "collections",
  "enterprise",
  "events",
  "explore",
  "features",
  "login",
  "marketplace",
  "notifications",
  "orgs",
  "pricing",
  "settings",
  "signup",
  "sponsors",
  "topics",
]);

export type SubmissionLinks = Readonly<{
  repository: string;
  issueForm: string;
  pullRequest: string;
  example: string;
  skill: string;
}>;

export type ParsedGitHubRepository = Readonly<{
  owner: string;
  repository: string;
  url: string;
}>;

export function createSubmissionLinks(repositoryUrl: string | undefined): SubmissionLinks | null {
  if (!repositoryUrl) return null;
  return Object.freeze({
    repository: repositoryUrl,
    issueForm: `${repositoryUrl}/issues/new?template=resource-submission.yml`,
    pullRequest: `${repositoryUrl}/compare`,
    example: `${repositoryUrl}/blob/HEAD/examples/resource-submission/resource.json`,
    skill: `${repositoryUrl}/blob/HEAD/${SUBMIT_RESOURCE_SKILL_PATH}`,
  });
}

export function resolveCatalogRepositoryUrl(configuredUrl: string | undefined): string {
  return configuredUrl ?? PRODUCTION_CATALOG_REPOSITORY_URL;
}

export function parseGitHubRepositoryInput(value: string): ParsedGitHubRepository | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  const hostname = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    (hostname !== "github.com" && hostname !== "www.github.com") ||
    url.username ||
    url.password
  ) {
    return null;
  }

  const segments = url.pathname.replace(/\/+$/, "").split("/").filter(Boolean);
  if (segments.length < 2) return null;

  const owner = segments[0];
  const repository = segments[1].replace(/\.git$/i, "");
  if (
    RESERVED_GITHUB_OWNERS.has(owner.toLowerCase()) ||
    !GITHUB_OWNER_PATTERN.test(owner) ||
    !GITHUB_REPO_PATTERN.test(repository) ||
    repository === "." ||
    repository === ".."
  ) {
    return null;
  }

  return Object.freeze({
    owner,
    repository,
    url: `https://github.com/${owner}/${repository}`,
  });
}

export function catalogFileRawUrl(catalogRepositoryUrl: string, relativePath: string): string | null {
  const catalog = parseGitHubRepositoryInput(catalogRepositoryUrl);
  if (!catalog) return null;
  return `https://raw.githubusercontent.com/${catalog.owner}/${catalog.repository}/HEAD/${relativePath}`;
}

export function buildAgentSubmissionPrompt(input: {
  sourceRepositoryUrl: string;
  catalogRepositoryUrl: string;
}): string | null {
  const source = parseGitHubRepositoryInput(input.sourceRepositoryUrl);
  const catalog = parseGitHubRepositoryInput(input.catalogRepositoryUrl);
  const skillUrl = catalog ? catalogFileRawUrl(catalog.url, SUBMIT_RESOURCE_SKILL_PATH) : null;
  if (!source || !catalog || !skillUrl) return null;

  return `请全程使用中文，帮我把下面这个公开 GitHub 仓库投稿到 CNMCP AI 扩展社区。

索引仓库：${catalog.url}
源码仓库：${source.url}

默认使用 GitHub API 完成投稿，不要求我克隆整个索引仓库，默认目标是做出可审查、可合并的 PR，而不是生成一篇阻塞报告。开始前先通过 GitHub 读取并严格执行投稿 Skill：
${skillUrl}

同时读取 schemas/resource.schema.json、catalog/tags.json、catalog/platforms.json、examples/resource-submission/resource.json、docs/content-review.md、.github/pull_request_template.md 和现有 resources/*/resource.json。把缺少的信息集中一次问完。

执行要求：
1. 按规范化后的源码地址和资源 id 查重。同一仓库不得重复收录；已有条目应更新而不是另开目录。发现 Issue 只是候选队列，不能当成已经收录，也不要信任它的类型标签。
2. 阅读源仓库 README、许可证、安装说明、Skill/MCP/插件清单，自行判断类型只能是 mcp、skill 或 plugin。plugin 必须设置 pluginScope: "ai-coding-tool"。类型无法判断时先问我，不要猜测成 unknown 资源类型。
3. 最终目录必须是 resources/<resource-id>/，目录名与 resource.json 的 id 一致，必须包含 resource.json 和安全的 README.md，可选本地图片。README 要说明它解决什么问题、核心能力、适合谁、使用前要知道和官方资源。不要提交 catalog.json、临时文件、密钥或站点生成物。
4. 标签必须来自 catalog/tags.json，平台必须来自 catalog/platforms.json。兼容性只记录上游明确声明并附真实核验日期；上游未声明时使用 unknown，不要根据协议或目录结构推断。partial 必须 note；unsupported 不得有 installations。安装命令只作为文本提交，禁止在投稿过程中执行第三方安装命令。只有上游明确提供平台专属资产时，才把它简短摘录到 README。
5. 投稿者不得设置或修改 featured，也不得新增 Schema 不存在的 verified 或 reviewStatus。选择中英双语时同时填写 name/nameEn 与 summary/summaryEn。许可证填写 SPDX；作者和来源必须如实记录。
6. 在临时目录或等价环境运行 yarn validate:resources；能跑 yarn lint 时一并跑。修复确定的结构或格式错误。
7. GitHub 未授权时先请我连接后重试。有写权限就在索引仓库开分支；否则在我的 fork 中创建或复用投稿分支，只上传这一条资源，并向主仓库发起 Ready for review 的正式 PR，不要默认 Draft。只有我明确要求草稿或材料确实未完成时才用 Draft，并写清剩余工作。
8. PR 正文说明查重、类型判断依据、作者/来源、非执行安装声明、校验结果，并关联已有发现 Issue（如有）。一个 PR 只包含这一条资源。
9. 跟进 CI。对确定的结构或格式错误直接修复；涉及收录判断、质量取舍或重复条目时停下来让我确认。
10. 只有完成上述补齐、校验和 GitHub 连接重试后仍无法继续，并且我明确同意时，才改用仓库 Issue Form 作为阻塞回退；Issue 只写一个真实阻塞点和明确解除步骤。

<!-- cnmcp-flow: submission -->
`;
}
