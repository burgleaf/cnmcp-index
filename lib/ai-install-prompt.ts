import type { Installation, Resource, ResourceKind } from "./catalog-types";

export const INSTALL_PLATFORM_IDS = ["codex", "claude-code", "cursor", "gemini-cli", "opencode"] as const;
export type InstallPlatformId = (typeof INSTALL_PLATFORM_IDS)[number];

export type InstallGuide = Readonly<{
  id: InstallPlatformId;
  name: string;
  label: string;
  content: string;
  contentType: "command" | "prompt" | "config";
  description: string;
  docsUrl: string;
  source: "upstream" | "platform";
}>;

const PLATFORM_NAMES: Readonly<Record<InstallPlatformId, string>> = {
  codex: "Codex",
  "claude-code": "Claude Code",
  cursor: "Cursor",
  "gemini-cli": "Gemini CLI",
  opencode: "OpenCode",
};

const PLATFORM_DOCS: Readonly<Record<InstallPlatformId, Readonly<Record<ResourceKind, string>>>> = {
  codex: {
    skill: "https://developers.openai.com/codex/skills",
    mcp: "https://developers.openai.com/codex/mcp",
    plugin: "https://developers.openai.com/codex/plugins",
  },
  "claude-code": {
    skill: "https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview",
    mcp: "https://code.claude.com/docs/en/mcp",
    plugin: "https://code.claude.com/docs/en/discover-plugins",
  },
  cursor: {
    skill: "https://cursor.com/docs/skills",
    mcp: "https://docs.cursor.com/context/model-context-protocol",
    plugin: "https://cursor.com/docs/plugins",
  },
  "gemini-cli": {
    skill: "https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/cli-reference.md",
    mcp: "https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/cli-reference.md",
    plugin: "https://github.com/google-gemini/gemini-cli/blob/main/docs/extensions/reference.md",
  },
  opencode: {
    skill: "https://opencode.ai/docs/skills",
    mcp: "https://opencode.ai/docs/mcp-servers/",
    plugin: "https://opencode.ai/docs/plugins",
  },
};

const KIND_NAMES: Readonly<Record<ResourceKind, string>> = {
  mcp: "MCP server",
  skill: "Agent Skill",
  plugin: "AI coding plugin",
};

function installationText(installation: Installation): string | null {
  if (installation.command) return installation.command;
  if (installation.content) return installation.content;
  if (installation.url) return installation.url;
  return null;
}

function upstreamGuide(resource: Resource, platformId: InstallPlatformId): InstallGuide | null {
  const compatibility = (resource.compatibility ?? []).find((entry) => entry.platform === platformId);
  const installation = compatibility?.installations?.find((entry) => installationText(entry));
  if (!installation) return null;
  const name = PLATFORM_NAMES[platformId];
  return {
    id: platformId,
    name,
    label: installation.label ?? `${name} 官方安装内容`,
    content: installationText(installation)!,
    contentType: installation.type === "config" ? "config" : installation.type === "command" ? "command" : "prompt",
    description: "该内容来自原项目提供的安装资料，请优先以原仓库最新说明为准。",
    docsUrl: compatibility?.evidenceUrl ?? resource.documentation ?? resource.repository,
    source: "upstream",
  };
}

function platformContent(resource: Resource, platformId: InstallPlatformId): Pick<InstallGuide, "content" | "contentType" | "description"> {
  const repository = resource.repository;
  const kind = KIND_NAMES[resource.kind];

  if (platformId === "codex") {
    if (resource.kind === "skill") return { content: `$skill-installer ${repository}`, contentType: "prompt", description: "发送给 Codex，让内置 Skill Installer 从 GitHub 检查并安装。" };
    return { content: `请读取这个 ${kind} 的官方仓库并为 Codex 安装，完成后验证可用性：${repository}`, contentType: "prompt", description: "MCP 与插件的实际入口由各仓库决定，Codex 会先读取上游说明。" };
  }

  if (platformId === "claude-code") {
    if (resource.kind === "skill") return { content: `npx skills add ${repository}`, contentType: "command", description: "Agent Skills 可通过 Skills CLI 从 GitHub 导入。" };
    if (resource.kind === "plugin") return { content: `请检查并安装这个 Claude Code 插件仓库；若它是 marketplace，先添加 marketplace 再安装对应插件：${repository}`, contentType: "prompt", description: "Claude Code 的 /plugin install 接受插件名，而不是任意仓库 URL。" };
    return { content: `请读取这个 MCP 仓库，并使用 claude mcp add 按官方说明完成配置：${repository}`, contentType: "prompt", description: "MCP 的命令、URL 和环境变量必须以原仓库为准。" };
  }

  if (platformId === "cursor") {
    return { content: `Install this ${kind} in Cursor from its official GitHub repository and verify that it works: ${repository}`, contentType: "prompt", description: "粘贴到 Cursor Agent；Skill 也可在 Customize 中通过 GitHub URL 导入。" };
  }

  if (platformId === "gemini-cli") {
    if (resource.kind === "skill") return { content: `gemini skills install ${repository}`, contentType: "command", description: "Gemini CLI 支持从 Git 仓库直接安装 Agent Skill。" };
    return { content: `请读取这个 ${kind} 的官方仓库并为 Gemini CLI 配置，完成后验证可用性：${repository}`, contentType: "prompt", description: "只有带 Gemini Extension 清单的仓库才能直接使用 extensions install。" };
  }

  return { content: `请读取 ${repository}，将其中的 ${kind} 安装到 OpenCode，并验证配置是否生效。`, contentType: "prompt", description: "OpenCode 的 Skill、MCP 和插件使用不同配置位置，由 Agent 按仓库结构处理。" };
}

export function createInstallGuide(resource: Resource, platformId: InstallPlatformId): InstallGuide {
  const upstream = upstreamGuide(resource, platformId);
  if (upstream) return upstream;
  const name = PLATFORM_NAMES[platformId];
  const generated = platformContent(resource, platformId);
  return {
    id: platformId,
    name,
    label: generated.contentType === "command" ? `${name} 命令` : `${name} 提示词`,
    ...generated,
    docsUrl: PLATFORM_DOCS[platformId][resource.kind],
    source: "platform",
  };
}

export function createInstallGuides(resource: Resource): ReadonlyArray<InstallGuide> {
  return INSTALL_PLATFORM_IDS.map((platformId) => createInstallGuide(resource, platformId));
}
