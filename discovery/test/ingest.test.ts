import { describe, expect, it } from "vitest";

import { mergeCandidates, selectPersistedCandidates } from "../src/crawl";
import { fetchMcpRegistry } from "../src/sources/mcp-registry";
import { candidateFromGithubRepo } from "../src/sources/github-search";
import type { CandidateRecord } from "../src/types";

const NOW = Date.parse("2026-08-31T00:00:00.000Z");

describe("MCP Registry 解析", () => {
  it("只保留带 GitHub 仓库的条目", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          servers: [
            {
              server: {
                name: "io.example/files",
                description: "Files MCP",
                repository: { url: "https://github.com/Example/Files" },
              },
            },
            {
              server: { name: "remote-only", description: "no repo", websiteUrl: "https://example.com" },
            },
          ],
          metadata: {},
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    const items = await fetchMcpRegistry(fetchImpl, 80, NOW);
    expect(items).toHaveLength(1);
    expect(items[0]?.repoFullName).toBe("example/files");
    expect(items[0]?.kind).toBe("mcp");
    expect(items[0]?.sources).toContain("mcp-registry");
  });
});

describe("mergeCandidates", () => {
  it("按仓库合并来源并取较高 stars", () => {
    const registry = [
      {
        repoFullName: "acme/tool",
        htmlUrl: "https://github.com/acme/tool",
        name: "tool",
        description: "from registry",
        stars: 0,
        forks: 0,
        language: null,
        license: "MIT",
        topics: ["mcp"],
        kind: "mcp" as const,
        inferredPlatforms: [],
        score: 20,
        pushedAt: "2026-01-01T00:00:00.000Z",
        sources: ["mcp-registry"],
      },
    ];
    const github = [
      candidateFromGithubRepo(
        {
          full_name: "acme/tool",
          html_url: "https://github.com/acme/tool",
          name: "tool",
          description: "from github",
          stargazers_count: 80,
          forks_count: 4,
          pushed_at: "2026-08-01T00:00:00.000Z",
          topics: ["mcp-server"],
          license: { spdx_id: "MIT" },
        },
        "mcp",
        [],
        NOW,
      ),
    ].filter((item) => item !== null);
    const merged = mergeCandidates([registry, github], NOW);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.stars).toBe(80);
    expect(merged[0]?.sources).toEqual(expect.arrayContaining(["mcp-registry", "github-search"]));
    expect(merged[0]?.kind).toBe("mcp");
  });
});

function candidate(overrides: Partial<CandidateRecord> & Pick<CandidateRecord, "repoFullName" | "stars" | "score">): CandidateRecord {
  return {
    htmlUrl: `https://github.com/${overrides.repoFullName}`,
    name: overrides.repoFullName.split("/")[1] ?? overrides.repoFullName,
    description: "",
    forks: 0,
    language: null,
    license: null,
    topics: [],
    kind: "mcp",
    inferredPlatforms: [],
    pushedAt: null,
    sources: ["github-search"],
    ...overrides,
  };
}

describe("selectPersistedCandidates", () => {
  it("不持久化 0 star，并只保留分数最高的有限条", () => {
    const selected = selectPersistedCandidates(
      [
        candidate({ repoFullName: "acme/zero", stars: 0, score: 99 }),
        candidate({ repoFullName: "acme/low", stars: 3, score: 10 }),
        candidate({ repoFullName: "acme/hot", stars: 80, score: 40 }),
        candidate({ repoFullName: "acme/mid", stars: 20, score: 20 }),
      ],
      { minStars: 1, limit: 2 },
    );
    expect(selected.map((item) => item.repoFullName)).toEqual(["acme/hot", "acme/mid"]);
  });
});
