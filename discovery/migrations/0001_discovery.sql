PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS candidates (
  repo_full_name TEXT PRIMARY KEY,
  html_url TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  stars INTEGER NOT NULL DEFAULT 0 CHECK (stars >= 0),
  forks INTEGER NOT NULL DEFAULT 0 CHECK (forks >= 0),
  language TEXT,
  license TEXT,
  topics TEXT NOT NULL DEFAULT '[]',
  kind TEXT NOT NULL CHECK (kind IN ('mcp', 'skill', 'plugin', 'unknown')),
  inferred_platforms TEXT NOT NULL DEFAULT '[]',
  score REAL NOT NULL DEFAULT 0,
  pushed_at TEXT,
  sources TEXT NOT NULL DEFAULT '[]',
  catalog_id TEXT,
  promotion_status TEXT NOT NULL DEFAULT 'none' CHECK (promotion_status IN ('none', 'issued', 'skipped')),
  issue_number INTEGER,
  first_seen_at INTEGER NOT NULL,
  last_crawled_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS candidates_score_idx
  ON candidates(score DESC, repo_full_name DESC);

CREATE INDEX IF NOT EXISTS candidates_stars_idx
  ON candidates(stars DESC, repo_full_name DESC);

CREATE INDEX IF NOT EXISTS candidates_recent_idx
  ON candidates(pushed_at DESC, repo_full_name DESC);

CREATE INDEX IF NOT EXISTS candidates_kind_score_idx
  ON candidates(kind, score DESC, repo_full_name DESC);

CREATE INDEX IF NOT EXISTS candidates_promotion_idx
  ON candidates(promotion_status, score DESC);

CREATE TABLE IF NOT EXISTS crawl_runs (
  crawl_date TEXT PRIMARY KEY,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  stats TEXT NOT NULL DEFAULT '{}'
);
