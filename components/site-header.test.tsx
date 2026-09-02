import { renderToStaticMarkup } from "react-dom/server";

import { SiteHeader } from "./site-header";

describe("SiteHeader", () => {
  it("展示中文品牌和完整主导航", () => {
    const html = renderToStaticMarkup(<SiteHeader />);

    expect(html).toContain("CNMCP");
    expect(html).toContain("AI扩展社区");
    expect(html).toContain('aria-label="主导航"');
    expect(html).not.toContain('href="/discover"');
    expect(html).toContain('href="/resources"');
    expect(html).toContain('href="/topics"');
    expect(html).toContain('href="/submit"');
  });
});
