CREATE TABLE IF NOT EXISTS task_gaps (
  gap_id TEXT PRIMARY KEY CHECK (gap_id GLOB 'gap-[0-9a-f]*' AND length(gap_id) = 28),
  normalized_query TEXT NOT NULL CHECK (length(normalized_query) BETWEEN 2 AND 80),
  resource_kind TEXT CHECK (resource_kind IS NULL OR resource_kind IN ('mcp', 'skill', 'plugin')),
  tag_id TEXT,
  status TEXT NOT NULL DEFAULT 'observed'
    CHECK (status IN ('observed', 'qualified', 'sourcing', 'evaluating', 'ready', 'published', 'monitoring', 'closed')),
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  search_count INTEGER NOT NULL DEFAULT 0 CHECK (search_count >= 0),
  zero_result_count INTEGER NOT NULL DEFAULT 0 CHECK (zero_result_count >= 0),
  low_result_count INTEGER NOT NULL DEFAULT 0 CHECK (low_result_count >= 0),
  min_result_count INTEGER NOT NULL CHECK (min_result_count >= 0),
  priority_score REAL NOT NULL DEFAULT 0 CHECK (priority_score BETWEEN 0 AND 100),
  qualified_at INTEGER,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS task_gaps_identity_idx
  ON task_gaps(normalized_query, COALESCE(resource_kind, ''), COALESCE(tag_id, ''));

CREATE INDEX IF NOT EXISTS task_gaps_priority_idx
  ON task_gaps(status, priority_score DESC, last_seen DESC);

CREATE TABLE IF NOT EXISTS search_event_receipts (
  event_key TEXT PRIMARY KEY,
  gap_id TEXT NOT NULL,
  normalized_query TEXT NOT NULL CHECK (length(normalized_query) BETWEEN 2 AND 80),
  resource_kind TEXT CHECK (resource_kind IS NULL OR resource_kind IN ('mcp', 'skill', 'plugin')),
  tag_id TEXT,
  result_count INTEGER NOT NULL CHECK (result_count BETWEEN 0 AND 10000),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS search_event_receipts_expires_idx
  ON search_event_receipts(expires_at);

CREATE TABLE IF NOT EXISTS task_gap_ledger (
  entry_id INTEGER PRIMARY KEY AUTOINCREMENT,
  gap_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('observed', 'qualified', 'sourcing', 'evaluating', 'ready', 'published', 'monitoring', 'closed')),
  occurred_at INTEGER NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(details_json)),
  UNIQUE (gap_id, event_type)
);

CREATE INDEX IF NOT EXISTS task_gap_ledger_gap_idx
  ON task_gap_ledger(gap_id, occurred_at);

CREATE TRIGGER IF NOT EXISTS search_event_receipts_observe_gap
AFTER INSERT ON search_event_receipts
BEGIN
  INSERT OR IGNORE INTO task_gap_ledger (gap_id, event_type, occurred_at, details_json)
  VALUES (NEW.gap_id, 'observed', NEW.created_at, '{}');
END;

CREATE TRIGGER IF NOT EXISTS search_event_receipts_aggregate_gap
AFTER INSERT ON search_event_receipts
BEGIN
  INSERT INTO task_gaps (
    gap_id,
    normalized_query,
    resource_kind,
    tag_id,
    status,
    first_seen,
    last_seen,
    search_count,
    zero_result_count,
    low_result_count,
    min_result_count,
    priority_score,
    updated_at
  ) VALUES (
    NEW.gap_id,
    NEW.normalized_query,
    NEW.resource_kind,
    NEW.tag_id,
    'observed',
    NEW.created_at,
    NEW.created_at,
    1,
    CASE WHEN NEW.result_count = 0 THEN 1 ELSE 0 END,
    CASE WHEN NEW.result_count BETWEEN 1 AND 2 THEN 1 ELSE 0 END,
    NEW.result_count,
    0,
    NEW.created_at
  )
  ON CONFLICT(gap_id) DO UPDATE SET
    last_seen = MAX(task_gaps.last_seen, excluded.last_seen),
    search_count = task_gaps.search_count + 1,
    zero_result_count = task_gaps.zero_result_count + excluded.zero_result_count,
    low_result_count = task_gaps.low_result_count + excluded.low_result_count,
    min_result_count = MIN(task_gaps.min_result_count, excluded.min_result_count),
    updated_at = excluded.updated_at;
END;
