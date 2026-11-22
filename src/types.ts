export interface Env {
  DB: D1Database;
  ARCHIVE: R2Bucket;
  WHOISEXTRACTOR_PID: string;
  WHOISEXTRACTOR_API_KEY: string;
  ACCESS_PASSWORD: string;
  SESSION_SECRET: string;
}

export type BatchStatus = "pending" | "syncing" | "completed" | "unavailable" | "failed";

export interface DailyBatchRow {
  day: string;
  total_count: number;
  tld_count: number;
  chunk_count: number;
  chunk_size: number;
  zip_size_bytes: number;
  raw_size_bytes: number;
  r2_key: string | null;
  source_etag: string | null;
  source_last_modified: string | null;
  status: BatchStatus;
  error_message: string | null;
  synced_at: string | null;
  duration_ms: number | null;
  created_at: string;
  updated_at: string;
}

export interface TldStatRow {
  day?: string;
  tld: string;
  domain_count: number;
}

export interface DomainChunkRow {
  day: string;
  chunk_index: number;
  start_offset: number;
  domain_count: number;
  first_domain: string;
  last_domain: string;
  domains_text: string;
}

export interface DomainChunkInput {
  chunkIndex: number;
  startOffset: number;
  domainCount: number;
  firstDomain: string;
  lastDomain: string;
  domainsText: string;
}

export interface DomainItem {
  domain: string;
  tld: string;
  rank: number;
}

export interface DomainPageResult {
  day: string;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  items: DomainItem[];
}

export interface CrossDaySearchItem {
  day: string;
  domain: string;
  tld: string;
}

export interface CrossDaySearchResult {
  query: string;
  regex?: boolean;
  tld: string;
  limit: number;
  totalReturned: number;
  truncated: boolean;
  perDayCounts: Array<{ day: string; count: number }>;
  items: CrossDaySearchItem[];
}

export interface SyncDayResult {
  date: string;
  status: BatchStatus;
  skipped?: boolean;
  totalCount?: number;
  tldCount?: number;
  chunkCount?: number;
  zipSizeBytes?: number;
  rawSizeBytes?: number;
  r2Key?: string;
  durationMs?: number;
  error?: string;
}
