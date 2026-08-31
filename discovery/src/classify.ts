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
  hint?: DiscoveryKind;
}>;

function haystack(input: ClassifyInput): string {
  return [input.name, input.description, ...input.topics].join(" ").toLowerCase();
}

function hasAny(text: string, needles: ReadonlyArray<string>): boolean {
  return needles.some((needle) => text.includes(needle));
}

export function classifyKind(input: ClassifyInput): DiscoveryKind {
  if (input.sources.includes("mcp-registry") || input.hint === "mcp") return "mcp";

  const text = haystack(input);
  const topics = input.topics.map((topic) => topic.toLowerCase());
  const vscodeOnly =
    topics.includes("vscode-extension") ||
    topics.includes("visual-studio-code") ||
    (hasAny(text, ["vscode extension", "vs code extension", ".vsix"]) &&
      !hasAny(text, ["claude-code", "openai-codex", "mcp", "skill.md"]));

  if (input.hint === "skill" || hasAny(text, ["skill.md", "claude-skill", "claude code skill", ".claude/skills", "agent skill"])) {
    return "skill";
  }
  if (
    topics.includes("mcp-server") ||
    topics.includes("mcp") ||
    hasAny(text, ["model context protocol", "modelcontextprotocol", "mcp server", "mcp.json"])
  ) {
    return "mcp";
  }
  if (
    input.hint === "plugin" ||
    hasAny(text, ["codex-plugin", "claude-code-plugin", "openai-codex", "codex plugin", "claude code plugin"])
  ) {
    return vscodeOnly ? "unknown" : "plugin";
  }
  if (vscodeOnly) return "unknown";
  return input.hint ?? "unknown";
}

export function inferPlatforms(input: ClassifyInput): InferredPlatform[] {
  const text = haystack(input);
  const platforms: InferredPlatform[] = [];
  if (hasAny(text, ["openai-codex", "openai/codex", "codex plugin", "chatgpt-codex"])) platforms.push("codex");
  if (hasAny(text, ["claude-code", "claude code", "anthropic"])) platforms.push("claude-code");
  if (hasAny(text, ["deepseek"])) platforms.push("deepseek");
  return platforms;
}
