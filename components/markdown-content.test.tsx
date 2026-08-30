import { renderToStaticMarkup } from "react-dom/server";

import { MarkdownContent, sanitizeMarkdownUrl } from "./markdown-content";

describe("MarkdownContent", () => {
  it("禁用原始 HTML 和危险协议，同时保留 GFM", () => {
    const markdown = [
      "<script>alert('xss')</script>",
      '<img src="x" onerror="alert(1)">',
      "[危险链接](javascript:alert(1))",
      "[安全外链](https://example.com/docs)",
      "~~删除线~~",
      "| A | B |\n| --- | --- |\n| 1 | 2 |",
    ].join("\n\n");
    const html = renderToStaticMarkup(<MarkdownContent markdown={markdown} />);

    expect(html).not.toContain("<script");
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("javascript:");
    expect(html).toContain("<del>删除线</del>");
    expect(html).toContain("<table");
  });

  it("为 HTTPS 外链增加安全属性，站内链接不强制新窗口", () => {
    const html = renderToStaticMarkup(
      <MarkdownContent markdown={"[外链](https://example.com) [站内](/resources)"} />,
    );

    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('href="/resources"');
    expect(sanitizeMarkdownUrl("data:text/html,<script>1</script>")).toBe("");
    expect(sanitizeMarkdownUrl("//evil.example/path")).toBe("");
  });
});
