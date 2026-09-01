import { describe, expect, it } from "vitest";

import { parseGithubRepo, normalizeSourceUrl } from "../src/github";
import { computeScore, recencyBonus } from "../src/score";
import { GITHUB_SEARCH_QUERIES } from "../src/sources/github-search";

describe("parseGithubRepo", () => {
  it("规范化常见 GitHub URL", () => {
    expect(parseGithubRepo("https://github.com/Owner/Repo.git")?.fullName).toBe("owner/repo");
    expect(parseGithubRepo("git+https://github.com/Owner/Repo")?.htmlUrl).toBe("https://github.com/Owner/Repo");
    expect(parseGithubRepo("https://gitlab.com/owner/repo")).toBeNull();
    expect(parseGithubRepo("not a url")).toBeNull();
  });
});

describe("normalizeSourceUrl", () => {
  it("与 Catalog 去重规则对齐", () => {
    expect(normalizeSourceUrl("https://github.com/Owner/Repo.git/")).toBe("https://github.com/owner/repo");
  });
});

describe("computeScore", () => {
  const now = Date.parse("2026-08-31T00:00:00.000Z");

  it("Registry 来源和已知 kind 有加分，recency 按 pushed_at 计算", () => {
    expect(recencyBonus("2026-08-20T00:00:00.000Z", now)).toBe(20);
    expect(recencyBonus("2026-07-01T00:00:00.000Z", now)).toBe(10);
    expect(recencyBonus("2025-01-01T00:00:00.000Z", now)).toBe(0);
    const score = computeScore({
      stars: 99,
      forks: 0,
      pushedAt: "2025-01-01T00:00:00.000Z",
      sources: ["mcp-registry"],
      kind: "mcp",
      now,
    });
    expect(score).toBeCloseTo(Math.log(100) * 4 + 15 + 5, 8);
  });
});

describe("GitHub Search 查询", () => {
  it("只用 topic 约束 mcp / skill / plugin，不含宽泛关键词", () => {
    expect(GITHUB_SEARCH_QUERIES.every((query) => query.q.includes("topic:"))).toBe(true);
    expect(GITHUB_SEARCH_QUERIES.some((query) => query.q === "codex plugin stars:>=10")).toBe(false);
  });
});
