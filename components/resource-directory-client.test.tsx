/** @jest-environment jsdom */

import { render, screen, waitFor } from "@testing-library/react";

import { ResourceDirectoryClient } from "./resource-directory-client";

describe("ResourceDirectoryClient 运行时降级", () => {
  it("Catalog 失败显示独立中文状态并说明静态详情不受影响", async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockRejectedValue(new Error("网络不可用"));

    try {
      render(<ResourceDirectoryClient platforms={[]} />);
      await waitFor(() => expect(screen.getByText("资源目录暂时无法加载")).toBeTruthy());
      expect(screen.getByText(/网络不可用。已打开的静态页面不受影响/)).toBeTruthy();
      expect(screen.getByRole("button", { name: "重新加载" })).toBeTruthy();
    } finally {
      global.fetch = originalFetch;
    }
  });
});
