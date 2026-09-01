/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { detailFixturePlatforms, detailFixtureResource } from "@/test/fixtures/resource-detail";

import { AiInstallPanel } from "./ai-install-panel";

function setClipboard(writeText: jest.Mock) {
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
}

describe("AiInstallPanel", () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });

  it("优先展示可复制的官方安装命令", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) } as Response);
    const writeText = jest.fn().mockResolvedValue(undefined);
    setClipboard(writeText);
    render(<AiInstallPanel platforms={detailFixturePlatforms} resource={detailFixtureResource} />);
    expect(screen.getByRole("heading", { name: "快速安装" })).toBeTruthy();
    expect(screen.getByText("Codex 命令")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "复制安装命令" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText).toHaveBeenCalledWith("tool install --token {{TOKEN_VALUE}}");
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("安装命令已复制"));
  });

  it("剪贴板失败时提供手动复制安装内容", async () => {
    global.fetch = jest.fn();
    setClipboard(jest.fn().mockRejectedValue(new Error("denied")));
    render(<AiInstallPanel platforms={detailFixturePlatforms} resource={detailFixtureResource} />);
    fireEvent.click(screen.getByRole("button", { name: "复制安装命令" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect((screen.getByLabelText("安装命令") as HTMLTextAreaElement).value).toContain("tool install --token");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("没有结构化安装信息时回退到完整文档入口", () => {
    render(<AiInstallPanel platforms={detailFixturePlatforms} resource={{ ...detailFixtureResource, compatibility: [] }} />);
    expect(screen.getByText("暂无可复制的官方安装命令")).toBeTruthy();
    expect(screen.getByRole("link", { name: "阅读完整安装说明" })).toBeTruthy();
  });
});
