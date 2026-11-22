-- Daily batches metadata
CREATE TABLE IF NOT EXISTS daily_batches (
  day TEXT PRIMARY KEY,
  total_count INTEGER NOT NULL DEFAULT 0,
  tld_count INTEGER NOT NULL DEFAULT 0,
  chunk_count INTEGER NOT NULL DEFAULT 0,
  chunk_size INTEGER NOT NULL DEFAULT 1000,
  zip_size_bytes INTEGER NOT NULL DEFAULT 0,
  raw_size_bytes INTEGER NOT NULL DEFAULT 0,
  r2_key TEXT,
  source_etag TEXT,
  source_last_modified TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  synced_at TEXT,
  duration_ms INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Daily TLD breakdown
CREATE TABLE IF NOT EXISTS daily_tld_stats (
  day TEXT NOT NULL,
  tld TEXT NOT NULL,
  domain_count INTEGER NOT NULL,
  PRIMARY KEY (day, tld)
);

CREATE INDEX IF NOT EXISTS idx_daily_tld_stats_day_count
  ON daily_tld_stats(day, domain_count DESC, tld ASC);

-- Chunked domains per day (1,000 domains per row, newline-delimited with leading/trailing '\n')
CREATE TABLE IF NOT EXISTS domain_chunks (
  day TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  start_offset INTEGER NOT NULL,
  domain_count INTEGER NOT NULL,
  first_domain TEXT NOT NULL,
  last_domain TEXT NOT NULL,
  domains_text TEXT NOT NULL,
  PRIMARY KEY (day, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_domain_chunks_day_range
  ON domain_chunks(day, first_domain, last_domain);
