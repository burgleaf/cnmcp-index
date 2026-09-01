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

  it("复制包含环境检测、证据、安全确认、验证和卸载要求的提示词", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) } as Response);
    const writeText = jest.fn().mockResolvedValue(undefined);
    setClipboard(writeText);
    render(<AiInstallPanel platforms={detailFixturePlatforms} resource={detailFixtureResource} />);
    fireEvent.click(screen.getByRole("button", { name: "复制 AI 安装提示词" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const prompt = writeText.mock.calls[0][0] as string;
    expect(prompt).toContain(detailFixtureResource.repository);
    expect(prompt).toContain("检查我的操作系统");
    expect(prompt).toContain("证据不足或不兼容并停止");
    expect(prompt).toContain("先向我确认");
    expect(prompt).toContain("完整卸载");
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("提示词已复制"));
  });

  it("剪贴板失败时提供完整手动复制内容", async () => {
    global.fetch = jest.fn();
    setClipboard(jest.fn().mockRejectedValue(new Error("denied")));
    render(<AiInstallPanel platforms={detailFixturePlatforms} resource={detailFixtureResource} />);
    fireEvent.click(screen.getByRole("button", { name: "复制 AI 安装提示词" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect((screen.getByLabelText("AI 安装提示词") as HTMLTextAreaElement).value).toContain("不要替我 Star");
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
