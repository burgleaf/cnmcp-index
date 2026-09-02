/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { detailFixtureResource } from "@/test/fixtures/resource-detail";

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
    render(<AiInstallPanel resource={detailFixtureResource} />);
    expect(screen.getByRole("heading", { name: "快速安装" })).toBeTruthy();
    expect(screen.getByText("Codex 命令")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "复制安装内容" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText).toHaveBeenCalledWith("tool install --token {{TOKEN_VALUE}}");
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("安装内容已复制"));
  });

  it("剪贴板失败时提供手动复制安装内容", async () => {
    global.fetch = jest.fn();
    setClipboard(jest.fn().mockRejectedValue(new Error("denied")));
    render(<AiInstallPanel resource={detailFixtureResource} />);
    fireEvent.click(screen.getByRole("button", { name: "复制安装内容" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect((screen.getByLabelText("安装内容") as HTMLTextAreaElement).value).toContain("tool install --token");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("没有结构化安装信息时为五个主流平台提供简短安装内容", () => {
    render(<AiInstallPanel resource={{ ...detailFixtureResource, compatibility: [] }} />);
    expect(screen.getAllByRole("tab")).toHaveLength(5);
    expect(screen.getByText(/读取这个 MCP server/)).toBeTruthy();
    expect(screen.getByText(detailFixtureResource.repository, { exact: false })).toBeTruthy();
  });

  it("Cursor 选项复制英文提示词和原仓库地址", async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    setClipboard(writeText);
    render(<AiInstallPanel resource={{ ...detailFixtureResource, compatibility: [] }} />);
    fireEvent.click(screen.getByRole("tab", { name: "Cursor" }));
    fireEvent.click(screen.getByRole("button", { name: "复制安装内容" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0][0]).toContain("Install this MCP");
    expect(writeText.mock.calls[0][0]).toContain(detailFixtureResource.repository);
  });

  it("支持方向键、Home 和 End 在平台选项间导航", () => {
    render(<AiInstallPanel resource={detailFixtureResource} />);
    const codex = screen.getByRole("tab", { name: "Codex" });
    codex.focus();
    fireEvent.keyDown(codex, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Claude Code" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(screen.getByRole("tab", { name: "Claude Code" }), { key: "End" });
    expect(screen.getByRole("tab", { name: "OpenCode" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(screen.getByRole("tab", { name: "OpenCode" }), { key: "Home" });
    expect(codex.getAttribute("aria-selected")).toBe("true");
  });
});
