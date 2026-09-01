import { renderToStaticMarkup } from "react-dom/server";

import { detailFixturePlatforms, detailFixtureResource } from "@/test/fixtures/resource-detail";

import { ResourceDetail } from "./resource-detail";

describe("ResourceDetail 隔离 fixture 静态 HTML", () => {
  it("展示资源用途、入口、结构化说明和快速安装", () => {
    const html = renderToStaticMarkup(
      <ResourceDetail platforms={detailFixturePlatforms} resource={detailFixtureResource} />,
    );

    expect(html).toContain("隔离详情 Fixture");
    expect(html).toContain("Isolated Detail Fixture");
    expect(html).toContain("Fixture 作者");
    expect(html).toContain("访问资源");
    expect(html).toContain("快速安装");
    expect(html).toContain("查看源代码");
    expect(html).toContain("访问官网");
    expect(html).toContain("阅读使用文档");
    expect(html).toContain("MIT");
    expect(html).toContain("上下文");
    expect(html).toContain("资源信息");
    expect(html).toContain("解决什么问题");
    expect(html).toContain("适合谁");
    expect(html).toContain("包含内容");
    expect(html).toContain("核心能力");
    expect(html).toContain("安全说明");
    expect(html).toContain("质量与活跃度");
    expect(html).toContain("1,200");
    expect(html).not.toContain("原作者支持的平台");
    expect(html).not.toContain("查看上游证据");
    expect(html).toContain("复制安装命令");
    expect(html).toContain("tool install --token");
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
