import { renderToStaticMarkup } from "react-dom/server";

import { createSubmissionLinks } from "@/lib/submission";

import SubmitPage, { metadata } from "./page";

describe("中文投稿页", () => {
  it("展示 Issue/PR 指引、Schema 字段和维护者控制边界", () => {
    const html = renderToStaticMarkup(<SubmitPage />);

    expect(html).toContain("投稿 AI 扩展资源");
    expect(html).toContain("使用 Issue Form");
    expect(html).toContain("直接提交 Pull Request");
    expect(html).toContain("resource.json 示例");
    expect(html).toContain("Codex/Claude Code 兼容状态");
    expect(html).toContain("featured");
    expect(html).toContain("verified");
    expect(html).toContain("reviewStatus");
    expect(html).toContain("不会执行第三方命令");
    expect(metadata.alternates?.canonical).toBe("https://www.cnmcp.com/submit/");
  });

  it("仓库地址未知时不猜测外链，配置后生成真实 GitHub Issue Form 和 PR 入口", () => {
    const html = renderToStaticMarkup(<SubmitPage />);
    expect(html).toContain("仓库入口尚未配置");
    expect(html).not.toContain("github.com/HelloGitHub-Team/geese");

    expect(createSubmissionLinks("https://github.com/example/community")).toEqual({
      repository: "https://github.com/example/community",
      issueForm: "https://github.com/example/community/issues/new?template=resource-submission.yml",
      pullRequest: "https://github.com/example/community/compare",
      example: "https://github.com/example/community/blob/HEAD/examples/resource-submission/resource.json",
    });
    expect(createSubmissionLinks(undefined)).toBeNull();
  });
});
