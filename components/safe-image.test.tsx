/** @jest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";

import { LOCAL_IMAGE_PLACEHOLDER, SafeImage } from "./safe-image";

describe("SafeImage", () => {
  it("图片失败后使用本地占位图并显示中文状态", () => {
    render(<SafeImage alt="资源预览" src="https://example.com/broken.png" />);
    fireEvent.error(screen.getByRole("img", { name: "资源预览" }));

    expect(screen.getByRole("img").getAttribute("src")).toBe(LOCAL_IMAGE_PLACEHOLDER);
    expect(screen.getByRole("status").textContent).toContain("图片加载失败，已显示本地占位图");
  });
});
