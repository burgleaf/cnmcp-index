import { renderToStaticMarkup } from "react-dom/server";

import NotFound from "@/app/not-found";
import { getAllResources } from "@/lib/catalog";
import { createResourceStaticParams } from "@/lib/static-params";
import { detailFixtureResource } from "@/test/fixtures/resource-detail";

import ResourceDetailPage, { dynamic, dynamicParams, generateStaticParams } from "./page";

describe("资源详情静态路由", () => {
  it("只枚举公开资源，正式 Catalog 只生成真实资源参数", () => {
    expect(createResourceStaticParams([
      detailFixtureResource,
      { ...detailFixtureResource, id: "unlisted-resource", visibility: "unlisted" },
      { ...detailFixtureResource, id: "removed-resource", visibility: "removed" },
    ])).toEqual([{ id: "fixture-mcp" }]);
    expect(generateStaticParams()).toEqual(getAllResources().map((resource) => ({ id: resource.id })));
    expect(dynamicParams).toBe(false);
    expect(dynamic).toBe("force-static");
  });

  it("不存在 ID 进入统一 404，404 本身保持中文静态内容", async () => {
    await expect(ResourceDetailPage({ params: Promise.resolve({ id: "missing-resource" }) })).rejects.toBeTruthy();
    const html = renderToStaticMarkup(<NotFound />);
    expect(html).toContain("404");
    expect(html).toContain("页面不存在");
    expect(html).toContain("可能已移动、下架或从未存在");
  });
});
