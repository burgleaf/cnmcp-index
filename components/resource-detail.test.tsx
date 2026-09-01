import { renderToStaticMarkup } from "react-dom/server";

import { detailFixturePlatforms, detailFixtureResource } from "@/test/fixtures/resource-detail";

import { ResourceDetail } from "./resource-detail";

describe("ResourceDetail 隔离 fixture 静态 HTML", () => {
  it("展示质量、上游支持证据、Markdown 和跨平台 AI 安装提示词", () => {
    const html = renderToStaticMarkup(
      <ResourceDetail platforms={detailFixturePlatforms} resource={detailFixtureResource} />,
    );

    expect(html).toContain("隔离详情 Fixture");
    expect(html).toContain("Isolated Detail Fixture");
    expect(html).toContain("Fixture 作者");
    expect(html).toContain("源码仓库");
    expect(html).toContain("官方网站");
    expect(html).toContain("使用文档");
    expect(html).toContain("MIT");
    expect(html).toContain("上下文");
    expect(html).toContain("Codex：原生支持，最后核验日期 2026-02-01");
    expect(html).toContain("最后核验日期：2026-02-02");
    expect(html).toContain("安全说明");
    expect(html).toContain("质量评分");
    expect(html).toContain("1,200");
    expect(html).toContain("原作者支持的平台");
    expect(html).toContain("查看上游证据");
    expect(html).toContain("复制 AI 安装提示词");
    expect(html).toContain("先阅读源码仓库和官方安装文档");
    expect(html).not.toContain("tool install --token");
    expect(html).toContain("统计数据加载中");
    expect(html).not.toContain("安装成功次数");
  });

  it("所有详情外链使用新窗口隔离属性", () => {
    const html = renderToStaticMarkup(
      <ResourceDetail platforms={detailFixturePlatforms} resource={detailFixtureResource} />,
    );
    const externalLinkCount = (html.match(/target="_blank"/g) ?? []).length;
    const isolatedLinkCount = (html.match(/rel="noopener noreferrer"/g) ?? []).length;

    expect(externalLinkCount).toBeGreaterThanOrEqual(7);
    expect(isolatedLinkCount).toBe(externalLinkCount);
  });
});
