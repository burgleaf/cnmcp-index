/** @jest-environment jsdom */

import { render, screen, waitFor } from "@testing-library/react";

import { DiscoveryGallery } from "./discovery-gallery";

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
});
