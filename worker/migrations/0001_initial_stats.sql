PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS resource_catalog (
  resource_id TEXT PRIMARY KEY,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  synced_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS resource_catalog_active_idx
  ON resource_catalog(active, resource_id);

CREATE TABLE IF NOT EXISTS resource_stats (
  resource_id TEXT PRIMARY KEY,
  command_copies INTEGER NOT NULL DEFAULT 0 CHECK (command_copies >= 0),
  source_visits INTEGER NOT NULL DEFAULT 0 CHECK (source_visits >= 0),
  updated_at INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (resource_id) REFERENCES resource_catalog(resource_id)
    ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS metric_receipts (
  event_key TEXT PRIMARY KEY,
  resource_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('command_copy', 'source_visit')),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  FOREIGN KEY (resource_id) REFERENCES resource_catalog(resource_id)
    ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS metric_receipts_expires_idx
  ON metric_receipts(expires_at);

CREATE INDEX IF NOT EXISTS metric_receipts_resource_idx
  ON metric_receipts(resource_id);

CREATE TABLE IF NOT EXISTS metric_rate_limits (
  rate_key TEXT PRIMARY KEY,
  bucket_start INTEGER NOT NULL,
  event_count INTEGER NOT NULL DEFAULT 0 CHECK (event_count >= 0),
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS metric_rate_limits_expires_idx
  ON metric_rate_limits(expires_at);

CREATE TRIGGER IF NOT EXISTS metric_receipts_increment_stats
AFTER INSERT ON metric_receipts
BEGIN
  UPDATE resource_stats
  SET
    command_copies = command_copies + CASE WHEN NEW.event_type = 'command_copy' THEN 1 ELSE 0 END,
    source_visits = source_visits + CASE WHEN NEW.event_type = 'source_visit' THEN 1 ELSE 0 END,
    updated_at = NEW.created_at
  WHERE resource_id = NEW.resource_id;
END;

-- Catalog 同步通过单条 INSERT 进入此视图。INSTEAD OF 触发器中的所有变更
-- 与该 INSERT 构成一个原子 SQLite 语句，避免 D1 不支持的显式 BEGIN。
CREATE VIEW IF NOT EXISTS resource_catalog_sync (resource_ids_json, synced_at) AS
SELECT CAST(NULL AS TEXT), CAST(NULL AS INTEGER)
WHERE 0;

CREATE TRIGGER IF NOT EXISTS resource_catalog_sync_apply
INSTEAD OF INSERT ON resource_catalog_sync
BEGIN
  SELECT CASE
    WHEN json_valid(NEW.resource_ids_json) = 0
    THEN RAISE(ABORT, 'invalid catalog sync payload')
  END;

  INSERT INTO resource_catalog (resource_id, active, synced_at)
  SELECT value, 1, NEW.synced_at
  FROM json_each(NEW.resource_ids_json)
  WHERE type = 'text'
  ON CONFLICT(resource_id) DO UPDATE SET
    active = 1,
    synced_at = excluded.synced_at;

  UPDATE resource_catalog
  SET active = 0,
      synced_at = NEW.synced_at
  WHERE active <> 0
    AND resource_id NOT IN (
      SELECT value
      FROM json_each(NEW.resource_ids_json)
      WHERE type = 'text'
    );

  INSERT OR IGNORE INTO resource_stats (
    resource_id,
    command_copies,
    source_visits,
    updated_at
  )
  SELECT value, 0, 0, 0
  FROM json_each(NEW.resource_ids_json)
  WHERE type = 'text';
END;
