import { readPublicEnvironment } from "./env";

describe("readPublicEnvironment", () => {
  it("缺少显式配置时使用正式生产基址", () => {
    expect(readPublicEnvironment({})).toEqual({
      siteUrl: "https://www.cnmcp.com",
      statsApiUrl: "https://api.cnmcp.com",
    });
  });

  it("读取并规范化合法的公开 HTTPS 基址", () => {
    expect(
      readPublicEnvironment({
        NEXT_PUBLIC_SITE_URL: " https://preview.cnmcp.com/ ",
        NEXT_PUBLIC_STATS_API_URL: "https://stats.cnmcp.com/",
      }),
    ).toEqual({
      siteUrl: "https://preview.cnmcp.com",
      statsApiUrl: "https://stats.cnmcp.com",
    });
  });

  it.each([
    ["相对地址", { NEXT_PUBLIC_SITE_URL: "/relative" }],
    ["非 HTTPS 地址", { NEXT_PUBLIC_STATS_API_URL: "http://api.cnmcp.com" }],
    ["带路径的基址", { NEXT_PUBLIC_SITE_URL: "https://www.cnmcp.com/path" }],
  ])("拒绝%s", (_label, environment) => {
    expect(() => readPublicEnvironment(environment)).toThrow();
  });

  it("接受可选的公开 Web Analytics token，并拒绝畸形值", () => {
    expect(
      readPublicEnvironment({
        NEXT_PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN: "0123456789abcdef0123456789abcdef",
      }),
    ).toEqual({
      siteUrl: "https://www.cnmcp.com",
      statsApiUrl: "https://api.cnmcp.com",
      cloudflareWebAnalyticsToken: "0123456789abcdef0123456789abcdef",
    });
    expect(() =>
      readPublicEnvironment({ NEXT_PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN: "not-a-site-token" }),
    ).toThrow("32 位十六进制");
  });

  it("拒绝把 Worker 密钥放入 NEXT_PUBLIC 变量", () => {
    expect(() =>
      readPublicEnvironment({ NEXT_PUBLIC_HASH_SALT: "not-a-public-value" }),
    ).toThrow("Worker secret");
  });

  it("忽略仅供 Worker 使用的非公开变量", () => {
    expect(
      readPublicEnvironment({ HASH_SALT: "server-side-only" }),
    ).toEqual({
      siteUrl: "https://www.cnmcp.com",
      statsApiUrl: "https://api.cnmcp.com",
    });
  });
});
