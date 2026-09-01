CREATE TABLE IF NOT EXISTS promotions (
  repo_full_name TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('issued', 'skipped')),
  issue_number INTEGER,
  catalog_id TEXT,
  updated_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO promotions (repo_full_name, status, issue_number, catalog_id, updated_at)
SELECT repo_full_name, promotion_status, issue_number, catalog_id, last_crawled_at
FROM candidates
WHERE promotion_status IN ('issued', 'skipped');
