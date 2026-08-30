/** @jest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import {
  fullAcceptanceCatalog,
  fullAcceptanceMcp,
  fullAcceptancePlatforms,
} from "@/test/fixtures/full-acceptance";

import { ResourceDetail } from "./resource-detail";
import { ResourceDirectoryClient } from "./resource-directory-client";

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function statsResponse(ids: ReadonlyArray<string>) {
  return response({
    generatedAt: 1_800_000_000_000,
    resources: Object.fromEntries(ids.map((id, index) => [id, {
      commandCopies: index + 1,
      sourceVisits: index + 4,
      updatedAt: 1_800_000_000_000,
    }])),
  });
}

function eventResponse(resourceId: string, eventType: string) {
  return response({
    resourceId,
    eventType,
    counted: true,
    stats: { commandCopies: 2, sourceVisits: 5, updatedAt: 1_800_000_000_000 },
  });
}

function normalWorkerFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(input.toString(), "https://www.cnmcp.com");
  if (url.pathname === "/catalog.json") return Promise.resolve(response(fullAcceptanceCatalog));
  if (url.pathname === "/v1/stats") {
    return Promise.resolve(statsResponse(url.searchParams.get("ids")?.split(",") ?? []));
  }
  if (url.pathname === "/v1/events") {
    const body = JSON.parse(init?.body as string) as { resourceId: string; eventType: string };
    return Promise.resolve(eventResponse(body.resourceId, body.eventType));
  }
  return Promise.resolve(response({}, 404));
}

function setClipboard(writeText: jest.Mock) {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
}

function eventBodies(fetchMock: jest.Mock): Array<{ resourceId: string; eventType: string; eventId: string }> {
  return fetchMock.mock.calls
    .filter(([, init]) => init?.method === "POST")
    .map(([, init]) => JSON.parse(init.body as string));
}

describe("9.1 本地跨层验收", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    cleanup();
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("从静态目录搜索和多维筛选三类资源，并提供可到达的详情链接与五态标记", async () => {
    const fetchMock = jest.fn(normalWorkerFetch);
    global.fetch = fetchMock as unknown as typeof fetch;
    render(<ResourceDirectoryClient platforms={fullAcceptancePlatforms} />);

    await waitFor(() => expect(screen.getByText("找到 3 个资源")).toBeTruthy());
    await waitFor(() => expect(screen.getAllByLabelText("统计数据可用")).toHaveLength(3));
    const initialStatsGets = fetchMock.mock.calls.filter(([input]) => new URL(input.toString(), "https://www.cnmcp.com").pathname === "/v1/stats");
    expect(initialStatsGets).toHaveLength(1);
    expect(new URL(initialStatsGets[0][0].toString()).searchParams.get("ids")?.split(",").sort())
      .toEqual(["acceptance-mcp", "acceptance-plugin", "acceptance-skill"]);
    expect(screen.getByRole("link", { name: "验收 MCP" }).getAttribute("href")).toBe("/resources/acceptance-mcp");
    expect(screen.getByRole("link", { name: "验收 Skill" }).getAttribute("href")).toBe("/resources/acceptance-skill");
    expect(screen.getByRole("link", { name: "验收 AI 编程插件" }).getAttribute("href")).toBe("/resources/acceptance-plugin");
    for (const accessibleStatus of ["原生支持", "支持", "部分支持", "不支持", "兼容性未知"]) {
      expect(screen.getAllByLabelText(new RegExp(`：${accessibleStatus}`)).length).toBeGreaterThan(0);
    }

    fireEvent.change(screen.getByRole("searchbox", { name: "搜索资源" }), {
      target: { value: "ACCEPTANCE AI CODING" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "资源类型" }), { target: { value: "plugin" } });
    fireEvent.change(screen.getByRole("combobox", { name: "平台" }), { target: { value: "codex" } });
    fireEvent.change(screen.getByRole("combobox", { name: "兼容状态" }), { target: { value: "unsupported" } });
    fireEvent.change(screen.getByRole("combobox", { name: "标签" }), { target: { value: "productivity" } });

    expect(screen.getByText("找到 1 个资源")).toBeTruthy();
    expect(screen.getByRole("link", { name: "验收 AI 编程插件" }).getAttribute("href")).toBe("/resources/acceptance-plugin");
    expect(screen.queryByRole("link", { name: "验收 MCP" })).toBeNull();

    fireEvent.change(screen.getByRole("searchbox", { name: "搜索资源" }), { target: { value: "no-match" } });
    expect(screen.getByText("没有找到匹配资源")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "清除筛选" })[0]);
    expect(screen.getByText("找到 3 个资源")).toBeTruthy();
    await waitFor(() => expect(screen.getAllByLabelText("统计数据可用")).toHaveLength(3));
  });

  it("Worker/D1 正常模拟时复制成功并为源码、官网、文档统一发送 source_visit", async () => {
    const fetchMock = jest.fn(normalWorkerFetch);
    global.fetch = fetchMock as unknown as typeof fetch;
    const writeText = jest.fn().mockResolvedValue(undefined);
    setClipboard(writeText);
    render(<ResourceDetail platforms={fullAcceptancePlatforms} resource={fullAcceptanceMcp} />);

    await waitFor(() => expect(screen.getByLabelText("统计数据可用")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "复制命令" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("站点不会执行该内容"));
    expect(writeText).toHaveBeenCalledWith("acceptance-mcp install --token {{TOKEN_VALUE}}");

    for (const name of ["源码仓库", "官方网站", "使用文档"]) {
      const link = screen.getByRole("link", { name });
      expect(link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))).toBe(true);
    }

    await waitFor(() => expect(eventBodies(fetchMock)).toHaveLength(4));
    const events = eventBodies(fetchMock);
    expect(events.filter((event) => event.eventType === "command_copy")).toHaveLength(1);
    expect(events.filter((event) => event.eventType === "source_visit")).toHaveLength(3);
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST" && init.keepalive === true)).toHaveLength(3);
  });

  it("Worker/D1 完全断开时静态详情、复制反馈和外链导航仍可用，仅统计 unavailable", async () => {
    const fetchMock = jest.fn().mockRejectedValue(new Error("worker disconnected"));
    global.fetch = fetchMock as unknown as typeof fetch;
    const writeText = jest.fn().mockResolvedValue(undefined);
    setClipboard(writeText);
    render(<ResourceDetail platforms={fullAcceptancePlatforms} resource={fullAcceptanceMcp} />);

    await waitFor(() => expect(screen.getByText(/统计服务暂不可用/)).toBeTruthy());
    expect(screen.getByRole("heading", { name: "验收 MCP" })).toBeTruthy();
    expect(screen.getByText("acceptance-mcp install --token {{TOKEN_VALUE}}"));

    fireEvent.click(screen.getByRole("button", { name: "复制命令" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("已复制到剪贴板"));
    expect(writeText).toHaveBeenCalledTimes(1);

    for (const [name, href] of [
      ["源码仓库", fullAcceptanceMcp.repository],
      ["官方网站", fullAcceptanceMcp.homepage],
      ["使用文档", fullAcceptanceMcp.documentation],
    ] as const) {
      const link = screen.getByRole("link", { name });
      expect(link.getAttribute("href")).toBe(href);
      expect(link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))).toBe(true);
    }
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(5));
    expect(screen.getByText(/统计服务暂不可用/)).toBeTruthy();
  });

  it("Clipboard 失败时提供手动复制文本且不误记 command_copy", async () => {
    const fetchMock = jest.fn(normalWorkerFetch);
    global.fetch = fetchMock as unknown as typeof fetch;
    setClipboard(jest.fn().mockRejectedValue(new Error("clipboard denied")));
    render(<ResourceDetail platforms={fullAcceptancePlatforms} resource={fullAcceptanceMcp} />);

    await waitFor(() => expect(screen.getByLabelText("统计数据可用")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "复制命令" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("未记录复制成功"));
    expect((screen.getByLabelText("可手动选择的安装文本") as HTMLTextAreaElement).value)
      .toBe("acceptance-mcp install --token {{TOKEN_VALUE}}");
    expect(eventBodies(fetchMock).filter((event) => event.eventType === "command_copy")).toHaveLength(0);
  });
});
