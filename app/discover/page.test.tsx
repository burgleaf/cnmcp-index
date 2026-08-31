import { renderToStaticMarkup } from "react-dom/server";

import DiscoverPage, { metadata } from "./page";

describe("发现页", () => {
  it("区分热度发现与正式 Catalog，并声明未经核验", () => {
    const html = renderToStaticMarkup(<DiscoverPage />);
    expect(html).toContain("发现热门 AI 扩展");
    expect(html).toContain("未核验安装命令与平台兼容性");
    expect(html).toContain("不能替代审核后的正式 Catalog");
    expect(metadata.alternates?.canonical).toBe("https://www.cnmcp.com/discover/");
  });
});
