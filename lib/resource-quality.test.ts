import { computeResourceQuality } from "./resource-quality";

describe("资源综合质量评分", () => {
  it("综合 Stars、Forks、活跃度、资料完整度和编辑精选，且与本站收录日期无关", () => {
    const base = {
      stars: 10_000,
      forks: 1_000,
      pushedAt: "2026-08-20T00:00:00Z",
      fetchedAt: "2026-09-01",
      archived: false,
      completeness: 10,
      featured: false,
    } as const;
    const quality = computeResourceQuality(base);
    expect(quality.score).toBeGreaterThanOrEqual(70);
    expect(quality.breakdown.stars).toBeLessThanOrEqual(40);
    expect(quality.breakdown.activity).toBe(25);
  });

  it("归档项目显著降权，异常数字被安全归一化", () => {
    const active = computeResourceQuality({ stars: 500, forks: 50, pushedAt: "2026-08-01T00:00:00Z", fetchedAt: "2026-09-01", archived: false, completeness: 8, featured: false });
    const archived = computeResourceQuality({ stars: -1, forks: Number.NaN, pushedAt: null, fetchedAt: "2026-09-01", archived: true, completeness: 8, featured: true });
    expect(archived.score).toBeLessThan(active.score / 2);
  });
});
