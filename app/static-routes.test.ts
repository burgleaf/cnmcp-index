import { getUsedTags } from "@/lib/catalog";

import { generateStaticParams as currentTagParams } from "./tags/[tag]/page";
import { createCategoryStaticParams, createExportSafeTagStaticParams, createPlatformStaticParams, createTagStaticParams, EMPTY_TAG_ROUTE_SENTINEL } from "../lib/static-params";

describe("聚合路由静态参数", () => {
  it("始终生成三种资源分类", () => {
    expect(createCategoryStaticParams()).toEqual([{ kind: "mcp" }, { kind: "skill" }, { kind: "plugin" }]);
  });

  it("只为启用平台生成路由", () => {
    expect(createPlatformStaticParams([
      { id: "codex", name: "Codex", homepage: "https://example.com", icon: "/platforms/codex.svg", enabled: true, sortOrder: 10 },
      { id: "disabled", name: "Disabled", homepage: "https://example.com", icon: "/platforms/disabled.svg", enabled: false, sortOrder: 20 },
    ])).toEqual([{ platform: "codex" }]);
  });

  it("只把已使用标签交给标签路由；空输入才使用导出占位标签", () => {
    expect(createTagStaticParams([
      { id: "context", name: "上下文", nameEn: "Context", description: "上下文", aliases: [], group: "capability", sortOrder: 1 },
      { id: "testing", name: "测试", nameEn: "Testing", description: "测试", aliases: [], group: "task", sortOrder: 2 },
    ])).toEqual([{ tag: "context" }, { tag: "testing" }]);
    expect(createExportSafeTagStaticParams([])).toEqual([{ tag: EMPTY_TAG_ROUTE_SENTINEL }]);
    expect(currentTagParams()).toEqual(getUsedTags().map((tag) => ({ tag: tag.id })));
  });
});
