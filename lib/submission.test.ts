import { readPublicEnvironment } from "./env";
import { createSubmissionLinks } from "./submission";

describe("投稿仓库配置", () => {
  it("规范化合法 GitHub 仓库并生成 Issue Form/PR 路径", () => {
    const environment = readPublicEnvironment({
      NEXT_PUBLIC_GITHUB_REPOSITORY_URL: " https://github.com/example/community.git/ ",
    });
    expect(environment.githubRepositoryUrl).toBe("https://github.com/example/community");
    expect(createSubmissionLinks(environment.githubRepositoryUrl)?.issueForm).toContain(
      "issues/new?template=resource-submission.yml",
    );
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
