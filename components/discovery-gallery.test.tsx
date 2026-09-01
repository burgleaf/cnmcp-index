/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { DiscoveryGallery } from "./discovery-gallery";

function discoveryItem(name: string) {
  return {
    repoFullName: `acme/${name}`,
    htmlUrl: `https://github.com/acme/${name}`,
    name,
    description: name,
    stars: 10,
    kind: "mcp",
    inferredPlatforms: [],
    score: 12,
    pushedAt: "2026-08-01T00:00:00.000Z",
    catalogId: null,
  };
}

describe("DiscoveryGallery 运行时降级", () => {
  it("发现 API 失败显示独立中文状态并说明正式 Catalog 不受影响", async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockRejectedValue(new Error("网络不可用"));

    try {
      render(<DiscoveryGallery />);
      await waitFor(() => expect(screen.getByText("发现列表暂时无法加载")).toBeTruthy());
      expect(screen.getByText(/网络不可用。正式 Catalog 与已打开的静态页面不受影响/)).toBeTruthy();
      expect(screen.getByRole("button", { name: "重新加载" })).toBeTruthy();
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("消费 nextCursor 加载下一页", async () => {
    const originalFetch = global.fetch;
    const fetchImplementation = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("cursor=30")) {
        return {
          ok: true,
          json: async () => ({ generatedAt: 1_788_163_200_000, items: [discoveryItem("page-two")], nextCursor: null }),
        };
      }
      return {
        ok: true,
        json: async () => ({ generatedAt: 1_788_163_200_000, items: [discoveryItem("page-one")], nextCursor: "30" }),
      };
    });
    global.fetch = fetchImplementation as unknown as typeof fetch;

    try {
      render(<DiscoveryGallery />);
      await waitFor(() => expect(screen.getByRole("heading", { name: "page-one" })).toBeTruthy());
      expect(screen.queryByText("未分类")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "加载更多" }));
      await waitFor(() => expect(screen.getByRole("heading", { name: "page-two" })).toBeTruthy());
      expect(screen.getByRole("heading", { name: "page-one" })).toBeTruthy();
      expect(screen.queryByRole("button", { name: "加载更多" })).toBeNull();
    } finally {
      global.fetch = originalFetch;
    }
  });
});
