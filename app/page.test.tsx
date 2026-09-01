import { renderToStaticMarkup } from "react-dom/server";

import { getAllResources } from "@/lib/catalog";

import HomePage from "./page";

describe("HomePage", () => {
  it("展示产品范围、发现入口，以及正式 Catalog 的精选与最近收录", () => {
    const html = renderToStaticMarkup(<HomePage />);
    const resources = getAllResources();
    const recent = resources[0];
    const featured = resources.find((resource) => resource.featured);

    expect(html).toContain("发现可靠的 AI 扩展资源");
    expect(html).toContain("MCP、Skill 和 AI 编程工具插件");
    expect(html).toContain("统计或发现服务暂时不可用时");
    expect(html).toContain('href="/resources"');
    expect(html).toContain('href="/discover"');
    if (featured) expect(html).toContain(`/resources/${featured.id}`);
    else expect(html).toContain("暂无精选资源");
    expect(recent).toBeDefined();
    expect(html).toContain(`/resources/${recent.id}`);
    expect(html).not.toContain("暂无最近收录资源");
  });
});
