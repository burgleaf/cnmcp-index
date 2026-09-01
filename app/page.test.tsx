import { renderToStaticMarkup } from "react-dom/server";

import { getAllResources } from "@/lib/catalog";

import HomePage from "./page";

describe("HomePage", () => {
  it("展示职业与任务入口、精选和高质量资源，不使用最近收录排序", () => {
    const html = renderToStaticMarkup(<HomePage />);
    const resources = getAllResources();
    const qualityLeader = [...resources].sort((left, right) => (right.quality?.score ?? 0) - (left.quality?.score ?? 0))[0];
    const featured = resources.find((resource) => resource.featured);

    expect(html).toContain("发现可靠的 AI 扩展");
    expect(html).toContain("MCP、Skill 和 AI 编程工具插件");
    expect(html).toContain("质量优先");
    expect(html).toContain('action="/resources"');
    expect(html).toContain('href="/topics"');
    if (featured) expect(html).toContain(`/resources/${featured.id}`);
    else expect(html).toContain("暂无精选资源");
    expect(html).toContain("按使用场景发现");
    expect(qualityLeader).toBeDefined();
    expect(html).toContain(`/resources/${qualityLeader.id}`);
    expect(html).not.toContain("最近收录");
  });
});
