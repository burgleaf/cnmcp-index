import { readPublicEnvironment } from "./env";
import {
  PRODUCTION_CATALOG_REPOSITORY_URL,
  SUBMIT_RESOURCE_SKILL_PATH,
  buildAgentSubmissionPrompt,
  catalogFileRawUrl,
  createSubmissionLinks,
  parseGitHubRepositoryInput,
  resolveCatalogRepositoryUrl,
} from "./submission";

describe("投稿仓库配置", () => {
  it("规范化合法 GitHub 仓库并生成 Issue Form/PR/Skill 路径", () => {
    const environment = readPublicEnvironment({
      NEXT_PUBLIC_GITHUB_REPOSITORY_URL: " https://github.com/example/community.git/ ",
    });
    expect(environment.githubRepositoryUrl).toBe("https://github.com/example/community");
    expect(createSubmissionLinks(environment.githubRepositoryUrl)).toEqual({
      repository: "https://github.com/example/community",
      issueForm: "https://github.com/example/community/issues/new?template=resource-submission.yml",
      pullRequest: "https://github.com/example/community/compare",
      example: "https://github.com/example/community/blob/HEAD/examples/resource-submission/resource.json",
      skill: `https://github.com/example/community/blob/HEAD/${SUBMIT_RESOURCE_SKILL_PATH}`,
    });
  });

  it.each([
    "https://gitlab.com/example/community",
    "http://github.com/example/community",
    "https://github.com/example",
    "https://github.com/example/community/issues",
  ])("拒绝不明确或非 GitHub 仓库根地址：%s", (value) => {
    expect(() => readPublicEnvironment({ NEXT_PUBLIC_GITHUB_REPOSITORY_URL: value })).toThrow(
      "https://github.com/<owner>/<repository>",
    );
  });
});

describe("源码仓库地址与 AI 投稿提示词", () => {
  it("接受仓库根地址、.git 后缀和多余路径", () => {
    expect(parseGitHubRepositoryInput(" https://github.com/Example/Cool-MCP.git/ ")).toEqual({
      owner: "Example",
      repository: "Cool-MCP",
      url: "https://github.com/Example/Cool-MCP",
    });
    expect(parseGitHubRepositoryInput("https://www.github.com/example/cool-mcp/tree/main/docs")).toEqual({
      owner: "example",
      repository: "cool-mcp",
      url: "https://github.com/example/cool-mcp",
    });
  });

  it.each([
    "",
    "not-a-url",
    "https://gitlab.com/example/cool-mcp",
    "http://github.com/example/cool-mcp",
    "https://github.com/orgs/example",
    "https://github.com/example",
  ])("拒绝无法确定仓库的输入：%s", (value) => {
    expect(parseGitHubRepositoryInput(value)).toBeNull();
  });

  it("未配置仓库时回退到正式索引仓库，配置后优先使用配置值", () => {
    expect(resolveCatalogRepositoryUrl(undefined)).toBe(PRODUCTION_CATALOG_REPOSITORY_URL);
    expect(resolveCatalogRepositoryUrl("https://github.com/example/community")).toBe(
      "https://github.com/example/community",
    );
  });

  it("生成指向源仓库、Skill 和正式 PR 约束的中文提示词", () => {
    const prompt = buildAgentSubmissionPrompt({
      sourceRepositoryUrl: "https://github.com/example/cool-mcp",
      catalogRepositoryUrl: PRODUCTION_CATALOG_REPOSITORY_URL,
    });

    expect(prompt).toContain("https://github.com/example/cool-mcp");
    expect(prompt).toContain(PRODUCTION_CATALOG_REPOSITORY_URL);
    expect(prompt).toContain(
      catalogFileRawUrl(PRODUCTION_CATALOG_REPOSITORY_URL, SUBMIT_RESOURCE_SKILL_PATH),
    );
    expect(prompt).toContain("Ready for review");
    expect(prompt).toContain("不要默认 Draft");
    expect(prompt).toContain("featured");
    expect(prompt).toContain("禁止在投稿过程中执行第三方安装命令");
    expect(prompt).toContain("README 要说明它解决什么问题");
    expect(prompt).toContain("上游未声明时使用 unknown");
    expect(prompt).toContain("<!-- cnmcp-flow: submission -->");
    expect(buildAgentSubmissionPrompt({
      sourceRepositoryUrl: "https://gitlab.com/example/cool-mcp",
      catalogRepositoryUrl: PRODUCTION_CATALOG_REPOSITORY_URL,
    })).toBeNull();
  });
});
