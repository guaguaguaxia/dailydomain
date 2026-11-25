import { extractDomainTextFromZip } from "./zip";
import type { DomainChunkInput, Env, SyncDayResult } from "./types";

export const CHUNK_SIZE = 1000;
const CHUNK_DB_BATCH = 15;
const TLD_MULTIROW = 25;
const TLD_DB_BATCH = 10;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DOMAIN_RE = /^[a-z0-9][a-z0-9.-]*[a-z0-9]$/;

export interface ParsedDomainDataset {
  chunks: DomainChunkInput[];
  tldCounts: Map<string, number>;
  totalCount: number;
  rawSizeBytes: number;
}

export function formatUtcDate(ms: number): string {
  const d = new Date(ms);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isValidDate(date: string): boolean {
  if (!DATE_RE.test(date)) {
    return false;
  }
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function extractTld(domain: string): string {
  const dot = domain.lastIndexOf(".");
  return dot > 0 && dot < domain.length - 1 ? domain.slice(dot + 1) : "";
}

function normalizeDomainLine(raw: string): string | null {
  const line = raw.trim().toLowerCase();
  if (line.length < 3 || line.length > 255) {
    return null;
  }
  const dot = line.lastIndexOf(".");
  if (dot <= 0 || dot >= line.length - 1) {
    return null;
  }
  if (!DOMAIN_RE.test(line) || line.includes("..")) {
    return null;
  }
  return line;
}

function buildChunksFromSortedList(sorted: string[], chunkSize: number): {
  chunks: DomainChunkInput[];
  tldCounts: Map<string, number>;
} {
  const chunks: DomainChunkInput[] = [];
  const tldCounts = new Map<string, number>();

  for (let i = 0; i < sorted.length; i += chunkSize) {
    const slice = sorted.slice(i, i + chunkSize);
    for (let j = 0; j < slice.length; j++) {
      const tld = extractTld(slice[j]);
      tldCounts.set(tld, (tldCounts.get(tld) ?? 0) + 1);
    }
    chunks.push({
      chunkIndex: chunks.length,
      startOffset: i,
      domainCount: slice.length,
      firstDomain: slice[0],
      lastDomain: slice[slice.length - 1],
      domainsText: `\n${slice.join("\n")}\n`,
    });
  }

  return { chunks, tldCounts };
}

/**
 * Streams line-by-line over raw domain text without building a full 476k-item split array
 * when the input is already sorted. Falls back to Set + sort only if an out-of-order line appears.
 */
export function parseDomainsToChunks(rawText: string, chunkSize = CHUNK_SIZE): ParsedDomainDataset {
  const chunks: DomainChunkInput[] = [];
  const tldCounts = new Map<string, number>();
  let batch: string[] = [];
  let prevDomain = "";
  let totalCount = 0;
  let pos = 0;
  let outOfOrder = false;

  while (pos < rawText.length) {
    let nextNl = rawText.indexOf("\n", pos);
    if (nextNl === -1) {
      nextNl = rawText.length;
    }
    const rawLine = rawText.slice(pos, nextNl);
    pos = nextNl + 1;

    const domain = normalizeDomainLine(rawLine);
    if (!domain) {
      continue;
    }
    if (domain === prevDomain) {
      continue;
    }
    if (prevDomain !== "" && domain < prevDomain) {
      outOfOrder = true;
      break;
    }

    prevDomain = domain;
    const tld = extractTld(domain);
    tldCounts.set(tld, (tldCounts.get(tld) ?? 0) + 1);
    batch.push(domain);
    totalCount++;

    if (batch.length === chunkSize) {
      chunks.push({
        chunkIndex: chunks.length,
        startOffset: totalCount - batch.length,
        domainCount: batch.length,
        firstDomain: batch[0],
        lastDomain: batch[batch.length - 1],
        domainsText: `\n${batch.join("\n")}\n`,
      });
      batch = [];
    }
  }

  if (outOfOrder) {
    const unique = new Set<string>();
    for (const c of chunks) {
      const lines = c.domainsText.slice(1, -1).split("\n");
      for (const l of lines) unique.add(l);
    }
    for (const l of batch) unique.add(l);
    // Reset pos to re-scan from the beginning cleanly so nothing is missed
    unique.clear();
    let scanPos = 0;
    while (scanPos < rawText.length) {
      let nextNl = rawText.indexOf("\n", scanPos);
      if (nextNl === -1) nextNl = rawText.length;
      const d = normalizeDomainLine(rawText.slice(scanPos, nextNl));
      scanPos = nextNl + 1;
      if (d) unique.add(d);
    }
    const sorted = Array.from(unique).sort();
    const rebuilt = buildChunksFromSortedList(sorted, chunkSize);
    return {
      chunks: rebuilt.chunks,
      tldCounts: rebuilt.tldCounts,
      totalCount: sorted.length,
      rawSizeBytes: rawText.length,
    };
  }

  if (batch.length > 0) {
    chunks.push({
      chunkIndex: chunks.length,
      startOffset: totalCount - batch.length,
      domainCount: batch.length,
      firstDomain: batch[0],
      lastDomain: batch[batch.length - 1],
      domainsText: `\n${batch.join("\n")}\n`,
    });
  }

  return {
    chunks,
    tldCounts,
    totalCount,
    rawSizeBytes: rawText.length,
  };
}

async function upsertStatusRow(
  env: Env,
  day: string,
  status: string,
  errorMessage: string | null,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO daily_batches (day, status, error_message, updated_at)
     VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
     ON CONFLICT(day) DO UPDATE SET
       status = excluded.status,
       error_message = excluded.error_message,
       updated_at = excluded.updated_at`,
  )
    .bind(day, status, errorMessage)
    .run();
}

async function clearDayData(
  env: Env,
  date: string,
  existingR2Key?: string | null,
): Promise<void> {
  const [yyyy, mm] = date.split("-");
  const defaultR2Key = `raw/${yyyy}/${mm}/${date}.zip`;

  await env.DB.batch([
    env.DB.prepare("DELETE FROM domain_chunks WHERE day = ?").bind(date),
    env.DB.prepare("DELETE FROM daily_tld_stats WHERE day = ?").bind(date),
    env.DB.prepare("DELETE FROM daily_batches WHERE day = ?").bind(date),
  ]);

  const keys = new Set<string>([defaultR2Key]);
  if (existingR2Key) {
    keys.add(existingR2Key);
  }
  for (const key of keys) {
    await env.ARCHIVE.delete(key);
  }

  console.log(
    JSON.stringify({
      event: "sync_cleared_existing",
      date,
      r2Keys: Array.from(keys),
    }),
  );
}

/**
 * Fetches, archives to R2, extracts, chunks, and indexes a single date's domains into D1.
 */
export async function syncDay(
  env: Env,
  date: string,
  options: { force?: boolean } = {},
): Promise<SyncDayResult> {
  if (!isValidDate(date)) {
    throw new Error(`Invalid date format: ${date}`);
  }

  const startedAt = Date.now();
  const force = Boolean(options.force);

  let existing = await env.DB.prepare(
    "SELECT status, total_count, tld_count, chunk_count, zip_size_bytes, raw_size_bytes, r2_key FROM daily_batches WHERE day = ?",
  )
    .bind(date)
    .first<{
      status: string;
      total_count: number;
      tld_count: number;
      chunk_count: number;
      zip_size_bytes: number;
      raw_size_bytes: number;
      r2_key: string | null;
    }>();

  if (!force && existing?.status === "completed") {
    return {
      date,
      status: "completed",
      skipped: true,
      totalCount: existing.total_count,
      tldCount: existing.tld_count,
      chunkCount: existing.chunk_count,
      zipSizeBytes: existing.zip_size_bytes,
      rawSizeBytes: existing.raw_size_bytes,
      r2Key: existing.r2_key ?? undefined,
      durationMs: Date.now() - startedAt,
    };
  }

  const apiKey = env.WHOISEXTRACTOR_API_KEY;
  if (!apiKey) {
    throw new Error("WHOISEXTRACTOR_API_KEY secret is not configured");
  }
  const pid = env.WHOISEXTRACTOR_PID || "10";
  const upstreamUrl = `https://get.whoisextractor.com/?api=${encodeURIComponent(apiKey)}&pid=${encodeURIComponent(pid)}&date=${date}`;

  if (force) {
    await clearDayData(env, date, existing?.r2_key);
    existing = null;
    await upsertStatusRow(env, date, "syncing", null);
  }

  let res: Response;
  try {
    res = await fetch(upstreamUrl, { method: "GET", redirect: "follow" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upstream fetch failed";
    if (existing?.status !== "completed") {
      await upsertStatusRow(env, date, "failed", message);
    }
    console.error(JSON.stringify({ event: "sync_fetch_error", date, error: message }));
    return { date, status: "failed", error: message, durationMs: Date.now() - startedAt };
  }

  if (res.status === 404) {
    if (existing?.status === "completed") {
      return {
        date,
        status: "completed",
        skipped: true,
        totalCount: existing.total_count,
        tldCount: existing.tld_count,
        chunkCount: existing.chunk_count,
        durationMs: Date.now() - startedAt,
      };
    }
    const msg = "No data available for this date yet";
    await upsertStatusRow(env, date, "unavailable", msg);
    console.log(JSON.stringify({ event: "sync_unavailable", date }));
    return { date, status: "unavailable", error: msg, durationMs: Date.now() - startedAt };
  }

  if (!res.ok) {
    const message = `Upstream API returned HTTP ${res.status}`;
    if (existing?.status !== "completed") {
      await upsertStatusRow(env, date, "failed", message);
    }
    console.error(JSON.stringify({ event: "sync_http_error", date, status: res.status }));
    return { date, status: "failed", error: message, durationMs: Date.now() - startedAt };
  }

  const sourceEtag = res.headers.get("etag");
  const sourceLastModified = res.headers.get("last-modified");
  let zipBytes: Uint8Array | null = new Uint8Array(await res.arrayBuffer());

  if (zipBytes.length < 22 || zipBytes[0] !== 0x50 || zipBytes[1] !== 0x4b) {
    const message = "Upstream response is not a valid ZIP archive";
    if (existing?.status !== "completed") {
      await upsertStatusRow(env, date, "failed", message);
    }
    console.error(JSON.stringify({ event: "sync_invalid_zip", date, bytes: zipBytes.length }));
    return { date, status: "failed", error: message, durationMs: Date.now() - startedAt };
  }

  const zipSizeBytes = zipBytes.length;
  const [yyyy, mm] = date.split("-");
  const r2Key = `raw/${yyyy}/${mm}/${date}.zip`;

  try {
    await env.ARCHIVE.put(r2Key, zipBytes, {
      httpMetadata: { contentType: "application/zip" },
      customMetadata: { day: date },
    });

    const extracted = extractDomainTextFromZip(zipBytes);
    const rawSizeBytes = extracted.rawBytes.length;
    const rawText = new TextDecoder("utf-8").decode(extracted.rawBytes);
    // Allow large ZIP buffer to be GC'd before writing D1 batches
    zipBytes = null;

    const parsed = parseDomainsToChunks(rawText, CHUNK_SIZE);
    if (parsed.totalCount === 0) {
      throw new Error(`No valid domains found in ${extracted.fileName}`);
    }

    await upsertStatusRow(env, date, "syncing", null);

    await env.DB.batch([
      env.DB.prepare("DELETE FROM domain_chunks WHERE day = ?").bind(date),
      env.DB.prepare("DELETE FROM daily_tld_stats WHERE day = ?").bind(date),
    ]);

    const chunkInsertSql = `INSERT INTO domain_chunks
      (day, chunk_index, start_offset, domain_count, first_domain, last_domain, domains_text)
      VALUES (?, ?, ?, ?, ?, ?, ?)`;

    for (let i = 0; i < parsed.chunks.length; i += CHUNK_DB_BATCH) {
      const slice = parsed.chunks.slice(i, i + CHUNK_DB_BATCH);
      const stmts = slice.map((chunk) =>
        env.DB.prepare(chunkInsertSql).bind(
          date,
          chunk.chunkIndex,
          chunk.startOffset,
          chunk.domainCount,
          chunk.firstDomain,
          chunk.lastDomain,
          chunk.domainsText,
        ),
      );
      await env.DB.batch(stmts);
    }

    const tldEntries = Array.from(parsed.tldCounts.entries()).sort((a, b) => b[1] - a[1]);
    const tldStmts: D1PreparedStatement[] = [];
    for (let i = 0; i < tldEntries.length; i += TLD_MULTIROW) {
      const group = tldEntries.slice(i, i + TLD_MULTIROW);
      const placeholders = group.map(() => "(?, ?, ?)").join(", ");
      const params: Array<string | number> = [];
      for (const [tld, count] of group) {
        params.push(date, tld, count);
      }
      tldStmts.push(
        env.DB.prepare(`INSERT INTO daily_tld_stats (day, tld, domain_count) VALUES ${placeholders}`).bind(
          ...params,
        ),
      );
    }

    for (let i = 0; i < tldStmts.length; i += TLD_DB_BATCH) {
      await env.DB.batch(tldStmts.slice(i, i + TLD_DB_BATCH));
    }

    const durationMs = Date.now() - startedAt;
    const syncedAt = new Date().toISOString();

    await env.DB.prepare(
      `INSERT INTO daily_batches (
         day, total_count, tld_count, chunk_count, chunk_size,
         zip_size_bytes, raw_size_bytes, r2_key, source_etag, source_last_modified,
         status, error_message, synced_at, duration_ms, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', NULL, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
       ON CONFLICT(day) DO UPDATE SET
         total_count = excluded.total_count,
         tld_count = excluded.tld_count,
         chunk_count = excluded.chunk_count,
         chunk_size = excluded.chunk_size,
         zip_size_bytes = excluded.zip_size_bytes,
         raw_size_bytes = excluded.raw_size_bytes,
         r2_key = excluded.r2_key,
         source_etag = excluded.source_etag,
         source_last_modified = excluded.source_last_modified,
         status = 'completed',
         error_message = NULL,
         synced_at = excluded.synced_at,
         duration_ms = excluded.duration_ms,
         updated_at = excluded.updated_at`,
    )
      .bind(
        date,
        parsed.totalCount,
        tldEntries.length,
        parsed.chunks.length,
        CHUNK_SIZE,
        zipSizeBytes,
        rawSizeBytes,
        r2Key,
        sourceEtag,
        sourceLastModified,
        syncedAt,
        durationMs,
      )
      .run();

    console.log(
      JSON.stringify({
        event: "sync_completed",
        date,
        totalCount: parsed.totalCount,
        tldCount: tldEntries.length,
        chunkCount: parsed.chunks.length,
        durationMs,
      }),
    );

    return {
      date,
      status: "completed",
      skipped: false,
      totalCount: parsed.totalCount,
      tldCount: tldEntries.length,
      chunkCount: parsed.chunks.length,
      zipSizeBytes,
      rawSizeBytes,
      r2Key,
      durationMs,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown sync error";
    console.error(JSON.stringify({ event: "sync_failed", date, error: message }));
    try {
      await upsertStatusRow(env, date, "failed", message.slice(0, 500));
    } catch {
      // Ignore secondary failure while recording error status
    }
    return {
      date,
      status: "failed",
      error: message,
      durationMs: Date.now() - startedAt,
    };
  }
}

/**
 * Scheduled cron runner: syncs yesterday (UTC) so finalized previous-day archives are
 * captured reliably once upstream stops updating the same-day file.
 */
export async function syncScheduledRecentDays(env: Env, scheduledTimeMs: number): Promise<SyncDayResult[]> {
  const yesterday = formatUtcDate(scheduledTimeMs - 24 * 60 * 60 * 1000);
  const results: SyncDayResult[] = [];

  try {
    const res = await syncDay(env, yesterday, { force: false });
    results.push(res);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected cron error";
    console.error(JSON.stringify({ event: "cron_day_error", date: yesterday, error: message }));
    results.push({ date: yesterday, status: "failed", error: message });
  }

  console.log(JSON.stringify({ event: "cron_summary", target: yesterday, results }));
  return results;
}
