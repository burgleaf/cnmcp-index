/** @jest-environment jsdom */

import { act, render, screen, waitFor } from "@testing-library/react";

import type { ResourceSummary } from "@/lib/catalog-types";
import { detailFixturePlatforms, detailFixtureResource } from "@/test/fixtures/resource-detail";

import { ResourceDetail } from "./resource-detail";
import { ResourceGallery } from "./resource-gallery";
import { ResourceStats } from "./resource-stats";
import { StatsProvider } from "./stats-provider";

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function statsBody(ids: ReadonlyArray<string>, values = { commandCopies: 2, sourceVisits: 5, updatedAt: 10 }) {
  return {
    generatedAt: 20,
    resources: Object.fromEntries(ids.map((id) => [id, values])),
  };
}

function summary(id: string): ResourceSummary {
  return {
    id,
    kind: "mcp",
    name: id,
    summary: `${id} summary`,
    authorName: "作者",
    tags: [],
    platforms: [],
    createdAt: "2026-01-01",
    featured: false,
  };
}

describe("Web 统计集成", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("列表卡片只展示上游质量，不请求站内运行时统计", async () => {
    const fetchMock = jest.fn().mockResolvedValue(response(statsBody(["first-resource", "second-resource"])));
    global.fetch = fetchMock;

    render(<ResourceGallery resources={[summary("first-resource"), summary("second-resource")]} />);

    expect(screen.getByRole("link", { name: "first-resource" })).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("超过 Worker 上限时按 100 个合理分批且每个 ID 只请求一次", async () => {
    const ids = Array.from({ length: 205 }, (_, index) => `resource-${String(index).padStart(3, "0")}`);
    const fetchMock = jest.fn((input: string) => {
      const requested = new URL(input).searchParams.get("ids")!.split(",");
      return Promise.resolve(response(statsBody(requested)));
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      <StatsProvider resourceIds={[...ids, ids[0]]}>
        <ResourceStats resourceId={ids[204]} />
      </StatsProvider>,
    );

    await waitFor(() => expect(screen.getByLabelText("统计数据可用")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const requested = fetchMock.mock.calls.flatMap(([input]) => new URL(input).searchParams.get("ids")!.split(","));
    expect(new Set(requested)).toEqual(new Set(ids));
    expect(requested).toHaveLength(ids.length);
  });

  it("0/0 只对 API 明确返回的资源显示，缺失资源保持 unavailable", async () => {
    global.fetch = jest.fn().mockResolvedValue(response({
      generatedAt: 20,
      resources: {
        "empty-resource": { commandCopies: 0, sourceVisits: 0, updatedAt: 0 },
      },
    }));

    render(
      <StatsProvider resourceIds={["empty-resource", "missing-resource"]}>
        <ResourceStats resourceId="empty-resource" />
        <ResourceStats resourceId="missing-resource" />
      </StatsProvider>,
    );

    await waitFor(() => expect(screen.getByLabelText("统计数据为空")).toBeTruthy());
    expect(screen.getByLabelText("统计数据为空").textContent).toContain("命令/配置复制次数0");
    expect(screen.getByLabelText("统计数据为空").textContent).toContain("聚合外链访问次数0");
    expect(screen.getByText(/统计服务暂不可用/)).toBeTruthy();
  });

  it("详情只请求当前资源，并准确展示两项统计", async () => {
    const fetchMock = jest.fn().mockResolvedValue(response(statsBody([detailFixtureResource.id], {
      commandCopies: 7,
      sourceVisits: 9,
      updatedAt: 10,
    })));
    global.fetch = fetchMock;

    render(<ResourceDetail platforms={detailFixturePlatforms} resource={detailFixtureResource} />);

    await waitFor(() => expect(screen.getByText("7")).toBeTruthy());
    expect(screen.getByText("命令/配置复制次数")).toBeTruthy();
    expect(screen.getByText("聚合外链访问次数")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(new URL(fetchMock.mock.calls[0][0] as string).searchParams.get("ids")).toBe(detailFixtureResource.id);
    expect(screen.queryByText(/安装次数|近似热度|verified/i)).toBeNull();
  });

  it.each([
    ["503", () => Promise.resolve(response({ error: { code: "UNAVAILABLE", message: "Unavailable" } }, 503))],
    ["协议错误", () => Promise.resolve(response({ generatedAt: 20, resources: [], invalid: true }))],
    ["网络错误", () => Promise.reject(new Error("offline"))],
  ])("Worker %s 时统计降级且静态详情与 AI 安装入口仍完整", async (_label, implementation) => {
    global.fetch = jest.fn(implementation) as unknown as typeof fetch;
    render(<ResourceDetail platforms={detailFixturePlatforms} resource={detailFixtureResource} />);

    await waitFor(() => expect(screen.getByText(/统计服务暂不可用/)).toBeTruthy());
    expect(screen.getByRole("heading", { name: detailFixtureResource.name })).toBeTruthy();
    expect(screen.getByRole("button", { name: "复制 AI 安装提示词" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "源码仓库" }).getAttribute("href")).toBe(detailFixtureResource.repository);
    expect(screen.queryByText("命令/配置复制次数")).toBeNull();
  });

  it("Worker 超时后降级且不移除静态详情", async () => {
    jest.useFakeTimers();
    global.fetch = jest.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    })) as unknown as typeof fetch;
    render(<ResourceDetail platforms={detailFixturePlatforms} resource={detailFixtureResource} />);

    await act(async () => {
      await jest.advanceTimersByTimeAsync(8_000);
    });
    expect(screen.getByText(/统计服务暂不可用/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: detailFixtureResource.name })).toBeTruthy();
    expect(screen.getByRole("button", { name: "复制 AI 安装提示词" })).toBeTruthy();
    jest.useRealTimers();
  });

  it("源码、官网、文档点击都非阻塞发送 keepalive source_visit 且不取消导航", async () => {
    const fetchMock = jest.fn((input: string, init?: RequestInit) => {
      if (init?.method === "GET") return Promise.resolve(response(statsBody([detailFixtureResource.id])));
      const body = JSON.parse(init?.body as string) as { resourceId: string; eventType: string };
      return Promise.resolve(response({
        ...body,
        counted: true,
        stats: { commandCopies: 0, sourceVisits: 1, updatedAt: 10 },
      }));
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    render(<ResourceDetail platforms={detailFixturePlatforms} resource={detailFixtureResource} />);
    await waitFor(() => expect(screen.getByLabelText("统计数据可用")).toBeTruthy());

    for (const name of ["源码仓库", "官方网站", "使用文档"]) {
      const link = screen.getByRole("link", { name });
      const click = new MouseEvent("click", { bubbles: true, cancelable: true });
      expect(link.dispatchEvent(click)).toBe(true);
    }

    const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(posts).toHaveLength(3);
    for (const [, init] of posts) {
      expect(init?.keepalive).toBe(true);
      expect(JSON.parse(init?.body as string)).toEqual(expect.objectContaining({
        resourceId: detailFixtureResource.id,
        eventType: "source_visit",
      }));
      expect(Object.keys(JSON.parse(init?.body as string))).toHaveLength(3);
    }
  });
});
