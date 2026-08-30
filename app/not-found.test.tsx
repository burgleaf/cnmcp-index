import { renderToStaticMarkup } from "react-dom/server";

import NotFound from "./not-found";

describe("NotFound", () => {
  it("展示统一中文 404 和返回入口", () => {
    const html = renderToStaticMarkup(<NotFound />);

    expect(html).toContain("页面不存在");
    expect(html).toContain("返回首页");
    expect(html).toContain('href="/"');
  });
});
