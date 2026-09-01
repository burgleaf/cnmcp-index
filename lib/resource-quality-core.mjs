const DAY_MS = 86_400_000;

function safeCount(value) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function scaledLog(value, ceiling, weight) {
  return Math.min(weight, (Math.log10(safeCount(value) + 1) / Math.log10(ceiling + 1)) * weight);
}

function activityScore(pushedAt, fetchedAt) {
  if (!pushedAt) return 0;
  const pushed = Date.parse(pushedAt);
  const fetched = Date.parse(`${fetchedAt}T23:59:59Z`);
  if (!Number.isFinite(pushed) || !Number.isFinite(fetched) || pushed > fetched) return 0;
  const days = (fetched - pushed) / DAY_MS;
  if (days <= 30) return 25;
  if (days <= 90) return 20;
  if (days <= 180) return 15;
  if (days <= 365) return 10;
  if (days <= 730) return 5;
  return 1;
}

export function computeResourceQualityCore(input) {
  const breakdown = {
    stars: scaledLog(input.stars, 100_000, 40),
    activity: activityScore(input.pushedAt, input.fetchedAt),
    forks: scaledLog(input.forks, 10_000, 10),
    completeness: Math.min(15, Math.max(0, input.completeness)),
    editorial: input.featured ? 10 : 0,
  };
  const raw = Object.values(breakdown).reduce((total, value) => total + value, 0);
  const score = Math.round((input.archived ? raw * 0.25 : raw) * 10) / 10;
  return Object.freeze({
    score,
    stars: safeCount(input.stars),
    forks: safeCount(input.forks),
    pushedAt: input.pushedAt,
    archived: input.archived,
    breakdown: Object.freeze(Object.fromEntries(Object.entries(breakdown).map(([key, value]) => [key, Math.round(value * 10) / 10]))),
  });
}
