export const RESOURCE_KINDS = ["mcp", "skill", "plugin"] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];
export type DiscoveryKind = ResourceKind | "unknown";
export const INFERRED_PLATFORMS = ["codex", "claude-code", "deepseek"] as const;
export type InferredPlatform = (typeof INFERRED_PLATFORMS)[number];

export type ClassifyInput = Readonly<{
  name: string;
  description: string;
  topics: ReadonlyArray<string>;
  sources: ReadonlyArray<string>;
}>;

function haystack(input: ClassifyInput): string {
  return [input.name, input.description, ...input.topics].join(" ").toLowerCase();
}

function hasAny(text: string, needles: ReadonlyArray<string>): boolean {
  return needles.some((needle) => text.includes(needle));
}

export function isIndexedKind(kind: DiscoveryKind): kind is ResourceKind {
  return RESOURCE_KINDS.includes(kind as ResourceKind);
}

function isVscodeOnly(text: string, topics: ReadonlyArray<string>): boolean {
  return (
    topics.includes("vscode-extension") ||
    topics.includes("visual-studio-code") ||
    (hasAny(text, ["vscode extension", "vs code extension", ".vsix"]) &&
      !hasAny(text, ["claude-code", "openai-codex", "mcp", "skill.md", "cursor-plugin"]))
  );
}

function isSkill(text: string, topics: ReadonlyArray<string>): boolean {
  return (
    topics.includes("claude-skill") ||
    topics.includes("agent-skills") ||
    hasAny(text, ["skill.md", "claude-skill", "claude code skill", ".claude/skills", "agent skill", "agent-skills"])
  );
}

function isMcp(text: string, topics: ReadonlyArray<string>, sources: ReadonlyArray<string>): boolean {
  return (
    sources.includes("mcp-registry") ||
    topics.includes("mcp-server") ||
    topics.includes("mcp") ||
    hasAny(text, ["model context protocol", "modelcontextprotocol", "mcp server", "mcp.json"])
  );
}

function isPlugin(text: string, topics: ReadonlyArray<string>): boolean {
  return (
    topics.includes("claude-code-plugin") ||
    topics.includes("cursor-plugin") ||
    topics.includes("codex-plugin") ||
    hasAny(text, [
      "codex-plugin",
      "claude-code-plugin",
      "claude code plugin",
      "codex plugin",
      "cursor plugin",
      "cursor-plugin",
      ".cursor-plugin",
      ".claude-plugin",
      "claude-plugin",
    ]) ||
    ((topics.includes("openai-codex") || topics.includes("claude-code")) && hasAny(text, ["plugin"]))
  );
}

export function classifyKind(input: ClassifyInput): DiscoveryKind {
  if (input.sources.includes("mcp-registry")) return "mcp";

  const text = haystack(input);
  const topics = input.topics.map((topic) => topic.toLowerCase());
  const vscodeOnly = isVscodeOnly(text, topics);

  if (isSkill(text, topics)) return "skill";
  if (isMcp(text, topics, input.sources)) return "mcp";
  if (isPlugin(text, topics)) return vscodeOnly ? "unknown" : "plugin";
  if (vscodeOnly) return "unknown";
  return "unknown";
}

export function inferPlatforms(input: ClassifyInput): InferredPlatform[] {
  const text = haystack(input);
  const platforms: InferredPlatform[] = [];
  if (hasAny(text, ["openai-codex", "openai/codex", "codex plugin", "chatgpt-codex"])) platforms.push("codex");
  if (hasAny(text, ["claude-code", "claude code"])) platforms.push("claude-code");
  if (hasAny(text, ["deepseek"])) platforms.push("deepseek");
  return platforms;
}
