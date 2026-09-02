const SECRET_PATTERNS = [
  /(?:sk|gh[pousr]|github_pat)[-_][A-Za-z0-9_-]{16,}/i,
  /\bbearer\s+[A-Za-z0-9._~+/-]{16,}/i,
];
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const URL_PATTERN = /https?:\/\/[^\s]+/gi;

export type GapPriorityInput = Readonly<{
  searchCount: number;
  zeroResultCount: number;
  lowResultCount: number;
  minResultCount: number;
}>;

type TaskGapRow = {
  gap_id: string;
  status: string;
  search_count: number;
  zero_result_count: number;
  low_result_count: number;
  min_result_count: number;
};

function integerSetting(value: string, minimum: number, maximum: number): number {
  if (!/^\d+$/.test(value)) throw new Error("invalid task gap configuration");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error("invalid task gap configuration");
  }
  return parsed;
}

export function sanitizeTaskQuery(value: string): string | null {
  const normalized = value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
  if (SECRET_PATTERNS.some((pattern) => pattern.test(normalized))) return null;
  const redacted = normalized
    .replace(EMAIL_PATTERN, "[email]")
    .replace(URL_PATTERN, "[url]")
    .replace(/\s+/g, " ")
    .trim();
  const truncated = Array.from(redacted).slice(0, 80).join("").trim();
  return Array.from(truncated).length >= 2 ? truncated : null;
}

export function resultBucket(resultCount: number): "zero" | "low" | "healthy" {
  if (resultCount === 0) return "zero";
  if (resultCount <= 2) return "low";
  return "healthy";
}

export function computeGapPriorityScore(input: GapPriorityInput): number {
  if (input.searchCount <= 0) return 0;
  const demand = Math.min(40, Math.log1p(input.searchCount) * 10);
  const zeroRate = input.zeroResultCount / input.searchCount;
  const lowRate = input.lowResultCount / input.searchCount;
  const unmet = zeroRate * 40 + lowRate * 20;
  const scarcity = input.minResultCount === 0 ? 20 : input.minResultCount <= 2 ? 10 : 0;
  return Math.min(100, Math.round((demand + unmet + scarcity) * 10) / 10);
}

export async function refreshTaskGaps(env: WorkerEnv, now = Date.now()): Promise<void> {
  const minimumSearches = integerSetting(env.GAP_QUALIFY_MIN_SEARCHES, 1, 10_000);
  const minimumScore = integerSetting(env.GAP_QUALIFY_MIN_SCORE, 1, 100);
  const result = await env.DB.prepare(
    `SELECT gap_id, status, search_count, zero_result_count, low_result_count, min_result_count
     FROM task_gaps WHERE status IN ('observed', 'qualified')`,
  ).all<TaskGapRow>();

  for (const row of result.results) {
    const score = computeGapPriorityScore({
      searchCount: row.search_count,
      zeroResultCount: row.zero_result_count,
      lowResultCount: row.low_result_count,
      minResultCount: row.min_result_count,
    });
    const qualifies = row.status === "observed" && row.search_count >= minimumSearches && score >= minimumScore;
    if (!qualifies) {
      await env.DB.prepare("UPDATE task_gaps SET priority_score = ?1, updated_at = ?2 WHERE gap_id = ?3")
        .bind(score, now, row.gap_id)
        .run();
      continue;
    }
    const update = await env.DB.prepare(
      `UPDATE task_gaps
       SET status = 'qualified', priority_score = ?1, qualified_at = COALESCE(qualified_at, ?2), updated_at = ?2
       WHERE gap_id = ?3 AND status = 'observed'`,
    ).bind(score, now, row.gap_id).run();
    if ((update.meta.changes ?? 0) > 0) {
      await env.DB.prepare(
        `INSERT OR IGNORE INTO task_gap_ledger (gap_id, event_type, occurred_at, details_json)
         VALUES (?1, 'qualified', ?2, ?3)`,
      ).bind(row.gap_id, now, JSON.stringify({ score, searchCount: row.search_count })).run();
    }
  }
}
