import { detailFixtureResource } from "@/test/fixtures/resource-detail";

import { createInstallGuide } from "./ai-install-prompt";

describe("平台安装内容", () => {
  const resource = { ...detailFixtureResource, compatibility: [] };

  it("Codex Skill 使用内置 Skill Installer 提示", () => {
    const guide = createInstallGuide({ ...resource, kind: "skill" }, "codex");
    expect(guide.content).toBe(`$skill-installer ${resource.repository}`);
    expect(guide.docsUrl).toContain("developers.openai.com");
  });

  it("Gemini CLI Skill 使用官方仓库安装命令", () => {
    expect(createInstallGuide({ ...resource, kind: "skill" }, "gemini-cli").content)
      .toBe(`gemini skills install ${resource.repository}`);
  });

  it("Cursor 使用包含仓库地址的英文提示词", () => {
    const guide = createInstallGuide(resource, "cursor");
    expect(guide.contentType).toBe("prompt");
    expect(guide.content).toContain("Install this MCP server in Cursor");
    expect(guide.content).toContain(resource.repository);
  });

  it("Claude Code 插件不把任意仓库地址伪装成 plugin install 参数", () => {
    const guide = createInstallGuide({ ...resource, kind: "plugin" }, "claude-code");
    expect(guide.content).not.toBe(`/plugin install ${resource.repository}`);
    expect(guide.content).toContain("marketplace");
    expect(guide.docsUrl).toContain("discover-plugins");
  });

  it("平台依据链接会随资源类型切换到对应官方文档", () => {
    expect(createInstallGuide(resource, "codex").docsUrl).toContain("/mcp");
    expect(createInstallGuide({ ...resource, kind: "plugin" }, "codex").docsUrl).toContain("/plugins");
    expect(createInstallGuide({ ...resource, kind: "skill" }, "claude-code").docsUrl).toContain("agent-skills");
    expect(createInstallGuide(resource, "opencode").docsUrl).toContain("mcp-servers");
  });

  it("原项目提供的结构化安装内容优先于平台回退内容", () => {
    const guide = createInstallGuide(detailFixtureResource, "codex");
    expect(guide.source).toBe("upstream");
    expect(guide.content).toBe("tool install --token {{TOKEN_VALUE}}");
  });
});
