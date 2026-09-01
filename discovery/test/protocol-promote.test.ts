import { describe, expect, it } from "vitest";

import { encodeNextCursor, parseDiscoveryQuery } from "../src/protocol";
import { buildPromotionIssue } from "../src/promote";
import type { StoredCandidate } from "../src/types";

describe("parseDiscoveryQuery", () => {
  it("接受合法参数并拒绝非法 kind/sort/limit/cursor", () => {
    expect(parseDiscoveryQuery(new URL("https://discovery.cnmcp.com/v1/discovery"))).toEqual({
      kind: null,
      sort: "score",
      limit: 30,
      offset: 0,
    });
    expect(parseDiscoveryQuery(new URL("https://discovery.cnmcp.com/v1/discovery?kind=skill&sort=stars&limit=10&cursor=20"))).toEqual({
      kind: "skill",
      sort: "stars",
      limit: 10,
      offset: 20,
    });
    expect(() => parseDiscoveryQuery(new URL("https://discovery.cnmcp.com/v1/discovery?kind=tool"))).toThrow("INVALID_KIND");
    expect(() => parseDiscoveryQuery(new URL("https://discovery.cnmcp.com/v1/discovery?kind=unknown"))).toThrow("INVALID_KIND");
    expect(() => parseDiscoveryQuery(new URL("https://discovery.cnmcp.com/v1/discovery?sort=hot"))).toThrow("INVALID_SORT");
    expect(() => parseDiscoveryQuery(new URL("https://discovery.cnmcp.com/v1/discovery?limit=0"))).toThrow("INVALID_LIMIT");
    expect(() => parseDiscoveryQuery(new URL("https://discovery.cnmcp.com/v1/discovery?cursor=-1"))).toThrow("INVALID_CURSOR");
  });

  it("满页才返回下一页 cursor", () => {
    expect(encodeNextCursor(0, 30, 30)).toBe("30");
    expect(encodeNextCursor(0, 30, 12)).toBeNull();
  });
});

describe("buildPromotionIssue", () => {
  it("生成不含安装命令密钥的中文 Issue 草稿", () => {
    const candidate: StoredCandidate = {
      repoFullName: "acme/files-mcp",
      htmlUrl: "https://github.com/acme/files-mcp",
      name: "files-mcp",
      description: "File tools",
      stars: 120,
      forks: 3,
      language: "TypeScript",
      license: "MIT",
      topics: ["mcp-server"],
      kind: "mcp",
      inferredPlatforms: ["claude-code"],
      score: 40,
      pushedAt: "2026-08-01T00:00:00.000Z",
      sources: ["mcp-registry"],
      catalogId: null,
      promotionStatus: "none",
      issueNumber: null,
      firstSeenAt: 1,
      lastCrawledAt: 1,
    };
    const issue = buildPromotionIssue(candidate);
    expect(issue.title).toContain("[自动发现]");
    expect(issue.body).toContain("https://github.com/acme/files-mcp");
    expect(issue.body).toContain("compatibility.status: unknown");
    expect(issue.body).not.toContain("sk-");
    expect(issue.labels).toEqual(["auto-discovery"]);
  });
});
