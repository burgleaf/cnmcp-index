import { renderToStaticMarkup } from "react-dom/server";

import type { CompatibilityStatus } from "@/lib/catalog-types";

import { PlatformBadge, getCompatibilityPresentation } from "./platform-badge";

const EXPECTED: ReadonlyArray<readonly [CompatibilityStatus, string]> = [
  ["native", "原生支持"],
  ["supported", "支持"],
  ["partial", "部分支持"],
  ["unsupported", "不支持"],
  ["unknown", "兼容性未知"],
];

describe("PlatformBadge", () => {
  it.each(EXPECTED)("将 %s 映射为独立且准确的 %s 语义", (status, label) => {
    expect(getCompatibilityPresentation(status).label).toBe(label);
    const html = renderToStaticMarkup(<PlatformBadge platformName="Codex" status={status} />);
    expect(html).toContain(`Codex：${label}`);
    expect(html).toContain(label);
  });

  it("在完整兼容数据可用时保留并公开最后核验日期", () => {
    const html = renderToStaticMarkup(<PlatformBadge platformName="Claude Code" status="partial" verifiedAt="2026-02-03" />);
    expect(html).toContain("最后核验日期 2026-02-03");
    expect(html).toContain("最后核验：2026-02-03");
    expect(html).not.toContain("Claude Code：支持");
  });
});
