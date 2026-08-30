/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import type { Platform, PlatformCompatibility } from "@/lib/catalog-types";

import { InstallPanel } from "./install-panel";

const platforms: ReadonlyArray<Platform> = [
  { id: "codex", name: "Codex", homepage: "https://example.com", icon: "/codex.svg", enabled: true, sortOrder: 10 },
  { id: "claude-code", name: "Claude Code", homepage: "https://example.com", icon: "/claude.svg", enabled: true, sortOrder: 20 },
  { id: "supported-ai", name: "支持平台", homepage: "https://example.com", icon: "/supported.svg", enabled: false, sortOrder: 30 },
  { id: "unsupported-ai", name: "不支持平台", homepage: "https://example.com", icon: "/unsupported.svg", enabled: false, sortOrder: 40 },
  { id: "unknown-ai", name: "未知平台", homepage: "https://example.com", icon: "/unknown.svg", enabled: false, sortOrder: 50 },
];

const compatibility: ReadonlyArray<PlatformCompatibility> = [
  {
    platform: "codex",
    status: "native",
    verifiedAt: "2026-01-01",
    installations: [{
      type: "command",
      shell: "bash",
      command: "install {{TOKEN_VALUE}}",
      target: "项目目录",
      placeholders: [{ name: "TOKEN_VALUE", description: "访问令牌", secret: true }],
    }],
  },
  {
    platform: "claude-code",
    status: "partial",
    verifiedAt: "2026-01-02",
    note: "不支持远程项目。",
    installations: [{
      type: "config",
      content: "{\"url\":\"{{SERVICE_URL}}\"}",
      target: "~/.claude/settings.json",
      placeholders: [{ name: "SERVICE_URL", description: "服务地址", secret: false }],
    }],
  },
  {
    platform: "supported-ai",
    status: "supported",
    verifiedAt: "2026-01-03",
    installations: [
      { type: "manual", content: "打开设置并启用。", target: "平台设置" },
      { type: "link", url: "https://example.com/install" },
    ],
  },
  { platform: "unsupported-ai", status: "unsupported", verifiedAt: "2026-01-04" },
  { platform: "unknown-ai", status: "unknown", verifiedAt: "2026-01-05" },
];

function setClipboard(writeText: jest.Mock) {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
}

describe("InstallPanel", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        resourceId: "test-resource",
        eventType: "command_copy",
        counted: true,
        stats: { commandCopies: 1, sourceVisits: 0, updatedAt: 1 },
      }),
    } as Response);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });
  it("展示五态、四种说明、限制、位置和全部占位符", () => {
    render(<InstallPanel compatibility={compatibility} resourceId="test-resource" platforms={platforms} />);

    expect(screen.getByLabelText(/Codex：原生支持/)).toBeTruthy();
    expect(screen.getByLabelText(/Claude Code：部分支持/)).toBeTruthy();
    expect(screen.getByLabelText(/支持平台：支持/)).toBeTruthy();
    expect(screen.getByLabelText(/不支持平台：不支持/)).toBeTruthy();
    expect(screen.getByLabelText(/未知平台：兼容性未知/)).toBeTruthy();
    expect(screen.getByText("部分支持限制：不支持远程项目。")).toBeTruthy();
    expect(screen.getByText("Shell：Bash")).toBeTruthy();
    expect(screen.getByText("操作位置：项目目录")).toBeTruthy();
    expect(screen.getByText("操作位置：~/.claude/settings.json")).toBeTruthy();
    expect(screen.getByText("TOKEN_VALUE")).toBeTruthy();
    expect(screen.getByText(/Secret 敏感值/)).toBeTruthy();
    expect(screen.getByText("SERVICE_URL")).toBeTruthy();
    expect(screen.getByText("普通变量")).toBeTruthy();
    expect(screen.getByText("打开设置并启用。")).toBeTruthy();
    expect(screen.getByRole("link", { name: "打开外部安装说明" }).getAttribute("rel")).toBe("noopener noreferrer");

    const unsupportedSection = screen.getByRole("heading", { name: "不支持平台" }).closest("section");
    expect(unsupportedSection).not.toBeNull();
    expect(within(unsupportedSection as HTMLElement).queryByRole("button")).toBeNull();
    expect(within(unsupportedSection as HTMLElement).getByText("该平台当前不支持，不提供安装入口。")).toBeTruthy();
    expect(screen.getByText("此兼容状态暂未提供可复制的安装说明，请前往资源源码或文档确认。")).toBeTruthy();
  });

  it("Clipboard 成功后反馈并触发回调边界，但绝不执行文本", async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    const onCopySuccess = jest.fn();
    setClipboard(writeText);
    render(<InstallPanel compatibility={compatibility} resourceId="test-resource" onCopySuccess={onCopySuccess} platforms={platforms} />);

    fireEvent.click(screen.getByRole("button", { name: "复制命令" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("install {{TOKEN_VALUE}}"));
    await waitFor(() => expect(onCopySuccess).toHaveBeenCalledWith({ platformId: "codex", installationType: "command" }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const eventRequest = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body as string);
    expect(eventRequest).toEqual(expect.objectContaining({ resourceId: "test-resource", eventType: "command_copy" }));
    expect(eventRequest.eventId).toMatch(/^[A-Za-z0-9._~-]{16,128}$/);
    expect(Object.keys(eventRequest)).toHaveLength(3);
    expect(screen.getByRole("status").textContent).toContain("站点不会执行该内容");
  });

  it("Clipboard 失败时提供手动选择降级且不触发成功回调", async () => {
    const writeText = jest.fn().mockRejectedValue(new Error("denied"));
    const onCopySuccess = jest.fn();
    setClipboard(writeText);
    render(<InstallPanel compatibility={compatibility} resourceId="test-resource" onCopySuccess={onCopySuccess} platforms={platforms} />);

    fireEvent.click(screen.getByRole("button", { name: "复制配置" }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(onCopySuccess).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("未记录复制成功");
    expect((screen.getByLabelText("可手动选择的安装文本") as HTMLTextAreaElement).value).toBe('{"url":"{{SERVICE_URL}}"}');
    expect(screen.getByRole("button", { name: "选择文本" })).toBeTruthy();
  });
});
