import type { DiscoveryKind } from "./classify";

const DAY_MS = 86_400_000;

export type ScoreInput = Readonly<{
  stars: number;
  forks: number;
  pushedAt: string | null;
  sources: ReadonlyArray<string>;
  kind: DiscoveryKind;
  now: number;
}>;

export function recencyBonus(pushedAt: string | null, now: number): number {
  if (!pushedAt) return 0;
  const timestamp = Date.parse(pushedAt);
  if (!Number.isFinite(timestamp) || timestamp > now) return 0;
  const age = now - timestamp;
  if (age <= 30 * DAY_MS) return 20;
  if (age <= 90 * DAY_MS) return 10;
  return 0;
}

export function computeScore(input: ScoreInput): number {
  const stars = Math.max(0, input.stars);
  const forks = Math.max(0, input.forks);
  const sourceBonus = input.sources.includes("mcp-registry") ? 15 : 0;
  const kindBonus = input.kind === "unknown" ? 0 : 5;
  return Math.log(stars + 1) * 4 + Math.log(forks + 1) + recencyBonus(input.pushedAt, input.now) + sourceBonus + kindBonus;
}
