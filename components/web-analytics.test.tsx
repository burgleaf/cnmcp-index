/** @jest-environment jsdom */

import { render } from "@testing-library/react";

jest.mock("next/script", () => function MockScript(props: React.ScriptHTMLAttributes<HTMLScriptElement>) {
  return <script {...props} />;
});

const loadComponent = (token?: string) => {
  jest.resetModules();
  if (token === undefined) delete process.env.NEXT_PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN;
  else process.env.NEXT_PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN = token;
  return jest.requireActual<typeof import("./web-analytics")>("./web-analytics").WebAnalytics;
};

describe("WebAnalytics", () => {
  const originalToken = process.env.NEXT_PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN;

  afterEach(() => {
    if (originalToken === undefined) delete process.env.NEXT_PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN;
    else process.env.NEXT_PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN = originalToken;
    jest.resetModules();
  });

  it("未配置公开 token 时不渲染且不影响静态构建", () => {
    const WebAnalytics = loadComponent();
    expect(render(<WebAnalytics />).container.childElementCount).toBe(0);
  });

  it("仅把公开 token 交给 Cloudflare Web Analytics beacon", () => {
    const WebAnalytics = loadComponent("0123456789abcdef0123456789abcdef");
    const script = render(<WebAnalytics />).container.querySelector("script");
    expect(script?.getAttribute("src")).toBe("https://static.cloudflareinsights.com/beacon.min.js");
    expect(script?.getAttribute("data-cf-beacon")).toBe(JSON.stringify({ token: "0123456789abcdef0123456789abcdef" }));
  });
});
