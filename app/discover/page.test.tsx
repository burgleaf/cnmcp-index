import { renderToStaticMarkup } from "react-dom/server";

import DiscoverPage, { metadata } from "./page";

describe("资源动态页", () => {
  it("只展示正式 Catalog 的公开维护信号", () => {
    const html = renderToStaticMarkup(<DiscoverPage />);
    expect(html).toContain("已收录资源的维护动态");
    expect(html).toContain("Stars、Forks、最近推送与抓取日期");
    expect(html).toContain("数据更新");
    expect(html).toMatch(/· (?:活跃|低活跃|已归档)/);
    expect(html).toContain("不代替你在原仓库核对安全性、许可证和最新安装说明");
    expect(metadata.alternates?.canonical).toBe("https://www.cnmcp.com/discover/");
  });
});
