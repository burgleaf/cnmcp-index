import { renderToStaticMarkup } from "react-dom/server";

import HomePage from "./page";

describe("HomePage", () => {
  it("展示产品范围、客户端目录入口和空正式 Catalog 的明确状态", () => {
    const html = renderToStaticMarkup(<HomePage />);

    expect(html).toContain("发现可靠的 AI 扩展资源");
    expect(html).toContain("MCP、Skill 和 AI 编程工具插件");
    expect(html).toContain("统计服务暂时不可用时");
    expect(html).toContain('href="/resources"');
    expect(html).toContain("暂无精选资源");
    expect(html).toContain("暂无最近收录资源");
  });
});
