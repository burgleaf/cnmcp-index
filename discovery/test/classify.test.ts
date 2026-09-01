import { describe, expect, it } from "vitest";

import { classifyKind, inferPlatforms } from "../src/classify";

describe("classifyKind", () => {
  it("Registry 来源一律视为 MCP", () => {
    expect(
      classifyKind({
        name: "anything",
        description: "a vscode extension",
        topics: ["vscode-extension"],
        sources: ["mcp-registry"],
      }),
    ).toBe("mcp");
  });

  it("识别 Skill 与 MCP topic", () => {
    expect(
      classifyKind({
        name: "writer",
        description: "A SKILL.md for Claude Code",
        topics: [],
        sources: ["github-search"],
      }),
    ).toBe("skill");
    expect(
      classifyKind({
        name: "files",
        description: "Model Context Protocol server",
        topics: ["mcp-server"],
        sources: ["github-search"],
      }),
    ).toBe("mcp");
  });

  it("不把泛 VS Code 扩展收成 plugin", () => {
    expect(
      classifyKind({
        name: "prettier",
        description: "VS Code extension",
        topics: ["vscode-extension"],
        sources: ["github-search"],
      }),
    ).toBe("unknown");
  });

  it("不把仅有 claude-code topic、无插件证据的仓库收成 plugin", () => {
    expect(
      classifyKind({
        name: "awesome-claude",
        description: "Notes about Claude Code",
        topics: ["claude-code"],
        sources: ["github-search"],
      }),
    ).toBe("unknown");
  });

  it("识别 Codex / Claude Code 插件", () => {
    expect(
      classifyKind({
        name: "codex-browser",
        description: "OpenAI Codex plugin",
        topics: ["openai-codex"],
        sources: ["github-search"],
      }),
    ).toBe("plugin");
  });
});

describe("inferPlatforms", () => {
  it("从文本推断 codex、claude-code、deepseek", () => {
    expect(
      inferPlatforms({
        name: "bridge",
        description: "Works with Claude Code and DeepSeek",
        topics: ["openai-codex"],
        sources: [],
      }),
    ).toEqual(["codex", "claude-code", "deepseek"]);
  });
});
