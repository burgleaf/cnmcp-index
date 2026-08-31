import { detailFixturePlatforms, detailFixtureResource } from "@/test/fixtures/resource-detail";

import { createRobots, createSitemapEntries } from "@/lib/static-seo";


describe("静态 sitemap 与 robots", () => {
  it("枚举固定页、三类分类、启用平台、已用标签和公开详情", () => {
    const entries = createSitemapEntries({
      resources: [
        detailFixtureResource,
        { ...detailFixtureResource, id: "hidden-resource", visibility: "unlisted" },
        { ...detailFixtureResource, id: "removed-resource", visibility: "removed" },
      ],
      platforms: detailFixturePlatforms,
      tags: [
        { id: "testing", name: "测试" },
        { id: "__empty-catalog__", name: "空目录哨兵" },
      ],
    });
    const urls = entries.map(({ url }) => url);

    expect(urls).toEqual(expect.arrayContaining([
      "https://www.cnmcp.com/",
      "https://www.cnmcp.com/resources/",
      "https://www.cnmcp.com/submit/",
      "https://www.cnmcp.com/discover/",
      "https://www.cnmcp.com/category/mcp/",
      "https://www.cnmcp.com/category/skill/",
      "https://www.cnmcp.com/category/plugin/",
      "https://www.cnmcp.com/platform/codex/",
      "https://www.cnmcp.com/platform/claude-code/",
      "https://www.cnmcp.com/tags/testing/",
      "https://www.cnmcp.com/resources/fixture-mcp/",
    ]));
    expect(urls).not.toContain("https://www.cnmcp.com/platform/registered-ai/");
    expect(urls.join("\n")).not.toMatch(/hidden-resource|removed-resource|__empty-catalog__/);
    expect(urls.every((url) => url.startsWith("https://www.cnmcp.com/"))).toBe(true);
  });

  it("robots 允许静态站点抓取并指向生产 sitemap", () => {
    expect(createRobots()).toEqual({
      rules: { userAgent: "*", allow: "/" },
      host: "https://www.cnmcp.com",
      sitemap: "https://www.cnmcp.com/sitemap.xml",
    });
  });
});
