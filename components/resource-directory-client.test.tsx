/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { ResourceDirectoryClient } from "./resource-directory-client";

describe("ResourceDirectoryClient 运行时降级", () => {
  it("Catalog 失败显示独立中文状态并说明静态详情不受影响", async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockRejectedValue(new Error("网络不可用"));

    try {
      render(<ResourceDirectoryClient />);
      await waitFor(() => expect(screen.getByText("资源目录暂时无法加载")).toBeTruthy());
      expect(screen.getByText(/网络不可用。已打开的静态页面不受影响/)).toBeTruthy();
      expect(screen.getByRole("button", { name: "重新加载" })).toBeTruthy();
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("搜索停顿后上报结果缺口，统计失败不影响目录", async () => {
    jest.useFakeTimers();
    const originalFetch = global.fetch;
    const fetchImplementation = jest.fn((...args: [RequestInfo | URL, RequestInit?]) => {
      const [input] = args;
      const url = input.toString();
      if (url.endsWith("/catalog.json")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            schemaVersion: 1,
            resources: [],
            tags: [],
            indexes: { tags: {}, kinds: {}, platforms: {} },
          }),
        } as Response);
      }
      return Promise.reject(new Error("统计服务不可用"));
    });
    global.fetch = fetchImplementation as unknown as typeof fetch;

    try {
      render(<ResourceDirectoryClient />);
      await waitFor(() => expect(screen.getByText("找到 0 个资源")).toBeTruthy());
      fireEvent.change(screen.getByRole("searchbox", { name: "搜索资源" }), {
        target: { value: "导演分镜" },
      });
      await jest.advanceTimersByTimeAsync(800);
      await waitFor(() => expect(fetchImplementation.mock.calls.some(([input, init]) =>
        input.toString().endsWith("/v1/search-events") && init?.method === "POST",
      )).toBe(true));
      expect(screen.getByText("没有找到匹配资源")).toBeTruthy();
    } finally {
      global.fetch = originalFetch;
      jest.useRealTimers();
    }
  });
});
