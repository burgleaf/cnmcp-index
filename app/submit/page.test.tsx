import { renderToStaticMarkup } from "react-dom/server";

import { PRODUCTION_CATALOG_REPOSITORY_URL, createSubmissionLinks } from "@/lib/submission";

import SubmitPage, { metadata } from "./page";

describe("中文投稿页", () => {
  it("展示 AI 提示词入口、Issue/PR 指引、Schema 字段和维护者控制边界", () => {
    const html = renderToStaticMarkup(<SubmitPage />);

    expect(html).toContain("投稿 AI 扩展资源");
    expect(html).toContain("用 AI 助手投稿");
    expect(html).toContain("复制提示词");
    expect(html).toContain("源码 GitHub 仓库地址");
    expect(html).toContain(PRODUCTION_CATALOG_REPOSITORY_URL);
    expect(html).toContain("使用 Issue Form");
    expect(html).toContain("直接提交 Pull Request");
    expect(html).toContain("resource.json 示例");
    expect(html).toContain("只有上游明确说明时才补充平台接入证据");
    expect(html).toContain("每个资源必须提供面向详情页的 README");
    expect(html).toContain("featured");
    expect(html).toContain("verified");
    expect(html).toContain("reviewStatus");
    expect(html).toContain("不会执行第三方命令");
    expect(metadata.description).toContain("GitHub Issue");
    expect(metadata.alternates?.canonical).toBe("https://www.cnmcp.com/submit/");
  });

  it("仓库地址未知时不猜测 Issue/PR 外链，配置后生成真实 GitHub 入口", () => {
    const html = renderToStaticMarkup(<SubmitPage />);
    expect(html).toContain("仓库入口尚未配置");
    expect(html).not.toContain("github.com/HelloGitHub-Team/geese");
    expect(html).not.toContain("issues/new?template=resource-submission.yml");

    expect(createSubmissionLinks("https://github.com/example/community")).toEqual({
      repository: "https://github.com/example/community",
      issueForm: "https://github.com/example/community/issues/new?template=resource-submission.yml",
      pullRequest: "https://github.com/example/community/compare",
      example: "https://github.com/example/community/blob/HEAD/examples/resource-submission/resource.json",
      skill: "https://github.com/example/community/blob/HEAD/.agents/skills/submit-cnmcp-resource/SKILL.md",
    });
    expect(createSubmissionLinks(undefined)).toBeNull();
  });
});
