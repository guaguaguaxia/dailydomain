import { extractTld, isValidDate } from "./sync";
import type {
  CrossDaySearchItem,
  CrossDaySearchResult,
  DailyBatchRow,
  DomainChunkRow,
  DomainItem,
  DomainPageResult,
  Env,
  TldStatRow,
} from "./types";

const SCAN_WINDOW_CHUNKS = 80;
const TLD_FAST_WINDOW = 25;
const DOWNLOAD_WINDOW_CHUNKS = 20;

export interface OverviewResponse {
  totalDays: number;
  totalDomains: number;
  latestDay: DailyBatchRow | null;
  days: DailyBatchRow[];
  topTlds: Array<{ tld: string; domain_count: number }>;
}

export interface DayDetailResponse {
  batch: DailyBatchRow;
  topTlds: TldStatRow[];
  prevDay: string | null;
  nextDay: string | null;
}

export interface DayQueryParams {
  q?: string;
  tld?: string;
  prefix?: string;
  page?: number;
  pageSize?: number;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function normalizeTldFilter(tld?: string): string {
  return (tld ?? "").trim().toLowerCase().replace(/^\.+/, "");
}

function normalizeQueryFilter(q?: string): string {
  return (q ?? "").trim().toLowerCase().slice(0, 100);
}

function normalizePrefixFilter(prefix?: string): string {
  return (prefix ?? "").trim().toLowerCase().slice(0, 64);
}

function splitChunkDomains(domainsText: string): string[] {
  const trimmed =
    domainsText.startsWith("\n") && domainsText.endsWith("\n")
      ? domainsText.slice(1, -1)
      : domainsText.trim();
  if (!trimmed) return [];
  return trimmed.split("\n");
}

function domainMatches(domain: string, q: string, tld: string, prefix: string): boolean {
  if (tld && !domain.endsWith(`.${tld}`)) {
    return false;
  }
  if (prefix && !domain.startsWith(prefix)) {
    return false;
  }
  if (q && !domain.includes(q)) {
    return false;
  }
  return true;
}

export async function getOverview(env: Env): Promise<OverviewResponse> {
  const daysRes = await env.DB.prepare(
    `SELECT day, total_count, tld_count, chunk_count, chunk_size, zip_size_bytes, raw_size_bytes,
            r2_key, source_etag, source_last_modified, status, error_message, synced_at, duration_ms,
            created_at, updated_at
     FROM daily_batches
     ORDER BY day DESC
     LIMIT 365`,
  ).all<DailyBatchRow>();

  const days = daysRes.results ?? [];
  const completedDays = days.filter((d) => d.status === "completed");
  const totalDomains = completedDays.reduce((sum, d) => sum + (d.total_count || 0), 0);

  const topTldsRes = await env.DB.prepare(
    `SELECT s.tld AS tld, SUM(s.domain_count) AS domain_count
     FROM daily_tld_stats s
     INNER JOIN daily_batches b ON b.day = s.day AND b.status = 'completed'
     GROUP BY s.tld
     ORDER BY domain_count DESC, s.tld ASC
     LIMIT 20`,
  ).all<{ tld: string; domain_count: number }>();

  return {
    totalDays: completedDays.length,
    totalDomains,
    latestDay: completedDays[0] ?? days[0] ?? null,
    days,
    topTlds: topTldsRes.results ?? [],
  };
}

export async function getDayDetail(env: Env, date: string): Promise<DayDetailResponse | null> {
  if (!isValidDate(date)) {
    return null;
  }

  const batch = await env.DB.prepare(
    `SELECT day, total_count, tld_count, chunk_count, chunk_size, zip_size_bytes, raw_size_bytes,
            r2_key, source_etag, source_last_modified, status, error_message, synced_at, duration_ms,
            created_at, updated_at
     FROM daily_batches WHERE day = ?`,
  )
    .bind(date)
    .first<DailyBatchRow>();

  if (!batch) {
    return null;
  }

  const [topTldsRes, prevRow, nextRow] = await Promise.all([
    env.DB.prepare(
      `SELECT tld, domain_count
       FROM daily_tld_stats
       WHERE day = ?
       ORDER BY domain_count DESC, tld ASC
       LIMIT 40`,
    )
      .bind(date)
      .all<TldStatRow>(),
    env.DB.prepare(
      "SELECT day FROM daily_batches WHERE day < ? AND status = 'completed' ORDER BY day DESC LIMIT 1",
    )
      .bind(date)
      .first<{ day: string }>(),
    env.DB.prepare(
      "SELECT day FROM daily_batches WHERE day > ? AND status = 'completed' ORDER BY day ASC LIMIT 1",
    )
      .bind(date)
      .first<{ day: string }>(),
  ]);

  return {
    batch,
    topTlds: topTldsRes.results ?? [],
    prevDay: prevRow?.day ?? null,
    nextDay: nextRow?.day ?? null,
  };
}

export async function queryDayDomains(
  env: Env,
  date: string,
  params: DayQueryParams,
): Promise<DomainPageResult | null> {
  if (!isValidDate(date)) {
    return null;
  }

  const batch = await env.DB.prepare(
    "SELECT day, total_count, chunk_size, status FROM daily_batches WHERE day = ?",
  )
    .bind(date)
    .first<{ day: string; total_count: number; chunk_size: number; status: string }>();

  if (!batch) {
    return null;
  }

  const q = normalizeQueryFilter(params.q);
  const tld = normalizeTldFilter(params.tld);
  const prefix = normalizePrefixFilter(params.prefix);
  const pageSize = clamp(Math.floor(params.pageSize ?? 100), 20, 500);
  const requestedPage = Math.max(1, Math.floor(params.page ?? 1));

  if (batch.status !== "completed" || batch.total_count === 0) {
    return {
      day: date,
      total: 0,
      page: 1,
      pageSize,
      totalPages: 1,
      items: [],
    };
  }

  // Fast path 1: unfiltered O(1) chunk lookup
  if (!q && !tld && !prefix) {
    const total = batch.total_count;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(requestedPage, totalPages);
    const offset = (page - 1) * pageSize;
    const chunkSize = batch.chunk_size || 1000;
    const startChunk = Math.floor(offset / chunkSize);
    const endChunk = Math.floor(Math.min(total - 1, offset + pageSize - 1) / chunkSize);

    const chunkRows = await env.DB.prepare(
      `SELECT chunk_index, start_offset, domains_text
       FROM domain_chunks
       WHERE day = ? AND chunk_index >= ? AND chunk_index <= ?
       ORDER BY chunk_index ASC`,
    )
      .bind(date, startChunk, endChunk)
      .all<Pick<DomainChunkRow, "chunk_index" | "start_offset" | "domains_text">>();

    const items: DomainItem[] = [];
    for (const row of chunkRows.results ?? []) {
      const domains = splitChunkDomains(row.domains_text);
      for (let i = 0; i < domains.length; i++) {
        const rank = row.start_offset + i + 1;
        if (rank > offset && items.length < pageSize) {
          const domain = domains[i];
          items.push({ domain, tld: extractTld(domain), rank });
        }
      }
    }

    return { day: date, total, page, pageSize, totalPages, items };
  }

  // Fast path 2: TLD-only filter uses exact count from daily_tld_stats and stops early once page is collected
  if (tld && !q && !prefix) {
    const tldStat = await env.DB.prepare(
      "SELECT domain_count FROM daily_tld_stats WHERE day = ? AND tld = ?",
    )
      .bind(date, tld)
      .first<{ domain_count: number }>();

    const total = tldStat?.domain_count ?? 0;
    if (total === 0) {
      return { day: date, total: 0, page: 1, pageSize, totalPages: 1, items: [] };
    }

    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(requestedPage, totalPages);
    const offset = (page - 1) * pageSize;
    const targetEnd = offset + pageSize;
    const tldNeedle = `.${tld}\n`;

    const items: DomainItem[] = [];
    let matchedCount = 0;
    let lastChunkIdx = -1;

    while (matchedCount < targetEnd) {
      const chunkRows = await env.DB.prepare(
        `SELECT chunk_index, start_offset, domains_text
         FROM domain_chunks
         WHERE day = ? AND chunk_index > ? AND instr(domains_text, ?) > 0
         ORDER BY chunk_index ASC
         LIMIT ?`,
      )
        .bind(date, lastChunkIdx, tldNeedle, TLD_FAST_WINDOW)
        .all<Pick<DomainChunkRow, "chunk_index" | "start_offset" | "domains_text">>();

      const rows = chunkRows.results ?? [];
      if (rows.length === 0) {
        break;
      }

      for (const row of rows) {
        lastChunkIdx = row.chunk_index;
        const domains = splitChunkDomains(row.domains_text);
        for (let i = 0; i < domains.length; i++) {
          const domain = domains[i];
          if (domain.endsWith(`.${tld}`)) {
            if (matchedCount >= offset && items.length < pageSize) {
              items.push({ domain, tld, rank: row.start_offset + i + 1 });
            }
            matchedCount++;
            if (matchedCount >= targetEnd) {
              break;
            }
          }
        }
        if (matchedCount >= targetEnd) {
          break;
        }
      }
    }

    return { day: date, total, page, pageSize, totalPages, items };
  }

  // General path: keyword q and/or prefix and/or tld
  const offset = (requestedPage - 1) * pageSize;
  const conditions: string[] = ["day = ?", "chunk_index > ?"];
  const baseBindings: Array<string | number> = [date];

  if (prefix) {
    // Prefix range pruning on sorted chunk boundaries
    const upperBound = `${prefix}~`;
    conditions.push("last_domain >= ?", "first_domain <= ?");
    baseBindings.push(prefix, upperBound);
  }
  if (tld) {
    conditions.push("instr(domains_text, ?) > 0");
    baseBindings.push(`.${tld}\n`);
  }
  if (q) {
    conditions.push("instr(domains_text, ?) > 0");
    baseBindings.push(q);
  }

  const sql = `SELECT chunk_index, start_offset, domains_text
               FROM domain_chunks
               WHERE ${conditions.join(" AND ")}
               ORDER BY chunk_index ASC
               LIMIT ?`;

  let lastChunkIdx = -1;
  let totalMatched = 0;
  const collected: DomainItem[] = [];
  const fallbackFirstPage: DomainItem[] = [];

  while (true) {
    const bindings = [date, lastChunkIdx, ...baseBindings.slice(1), SCAN_WINDOW_CHUNKS];
    const chunkRows = await env.DB.prepare(sql)
      .bind(...bindings)
      .all<Pick<DomainChunkRow, "chunk_index" | "start_offset" | "domains_text">>();

    const rows = chunkRows.results ?? [];
    if (rows.length === 0) {
      break;
    }

    for (const row of rows) {
      lastChunkIdx = row.chunk_index;
      const domains = splitChunkDomains(row.domains_text);
      for (let i = 0; i < domains.length; i++) {
        const domain = domains[i];
        if (!domainMatches(domain, q, tld, prefix)) {
          continue;
        }
        const item: DomainItem = {
          domain,
          tld: extractTld(domain),
          rank: row.start_offset + i + 1,
        };
        if (fallbackFirstPage.length < pageSize) {
          fallbackFirstPage.push(item);
        }
        if (totalMatched >= offset && collected.length < pageSize) {
          collected.push(item);
        }
        totalMatched++;
      }
    }

    if (rows.length < SCAN_WINDOW_CHUNKS) {
      break;
    }
  }

  const totalPages = Math.max(1, Math.ceil(totalMatched / pageSize));
  const page = Math.min(requestedPage, totalPages);
  if (page < requestedPage && totalMatched > 0 && page > 1) {
    return queryDayDomains(env, date, { ...params, page });
  }
  const items = page === requestedPage ? collected : totalMatched > 0 && page === 1 ? fallbackFirstPage : [];

  return {
    day: date,
    total: totalMatched,
    page,
    pageSize,
    totalPages,
    items,
  };
}

export async function searchAcrossDays(
  env: Env,
  params: { q: string; tld?: string; limit?: number },
): Promise<CrossDaySearchResult> {
  const q = normalizeQueryFilter(params.q);
  const tld = normalizeTldFilter(params.tld);
  const limit = clamp(Math.floor(params.limit ?? 100), 10, 500);

  if (q.length < 2) {
    throw new Error("Search query must be at least 2 characters");
  }

  const daysRes = await env.DB.prepare(
    "SELECT day FROM daily_batches WHERE status = 'completed' ORDER BY day DESC LIMIT 90",
  ).all<{ day: string }>();

  const completedDays = (daysRes.results ?? []).map((r) => r.day);
  const items: CrossDaySearchItem[] = [];
  const perDayCounts: Array<{ day: string; count: number }> = [];
  let truncated = false;

  for (const day of completedDays) {
    if (items.length >= limit) {
      truncated = true;
      break;
    }

    let lastChunkIdx = -1;
    let dayMatches = 0;

    const conditions = ["day = ?", "chunk_index > ?", "instr(domains_text, ?) > 0"];
    const extraBinds: string[] = [q];
    if (tld) {
      conditions.push("instr(domains_text, ?) > 0");
      extraBinds.push(`.${tld}\n`);
    }

    const sql = `SELECT chunk_index, domains_text
                 FROM domain_chunks
                 WHERE ${conditions.join(" AND ")}
                 ORDER BY chunk_index ASC
                 LIMIT ?`;

    while (true) {
      const res = await env.DB.prepare(sql)
        .bind(day, lastChunkIdx, ...extraBinds, SCAN_WINDOW_CHUNKS)
        .all<Pick<DomainChunkRow, "chunk_index" | "domains_text">>();

      const rows = res.results ?? [];
      if (rows.length === 0) break;

      for (const row of rows) {
        lastChunkIdx = row.chunk_index;
        const domains = splitChunkDomains(row.domains_text);
        for (const domain of domains) {
          if (!domainMatches(domain, q, tld, "")) continue;
          if (items.length < limit) {
            items.push({ day, domain, tld: extractTld(domain) });
            dayMatches++;
          } else {
            truncated = true;
            break;
          }
        }
        if (truncated) break;
      }

      if (truncated || rows.length < SCAN_WINDOW_CHUNKS) break;
    }

    if (dayMatches > 0) {
      perDayCounts.push({ day, count: dayMatches });
    }
  }

  return {
    query: q,
    tld,
    limit,
    totalReturned: items.length,
    truncated,
    perDayCounts,
    items,
  };
}

export async function streamDayDownload(
  env: Env,
  date: string,
  options: { format: "txt" | "csv" | "zip"; tld?: string; q?: string },
): Promise<Response> {
  if (!isValidDate(date)) {
    return Response.json({ error: "Invalid date" }, { status: 400 });
  }

  const batch = await env.DB.prepare(
    "SELECT day, status, r2_key FROM daily_batches WHERE day = ?",
  )
    .bind(date)
    .first<{ day: string; status: string; r2_key: string | null }>();

  if (!batch || batch.status !== "completed") {
    return Response.json({ error: "No completed data for this date" }, { status: 404 });
  }

  const tld = normalizeTldFilter(options.tld);
  const q = normalizeQueryFilter(options.q);

  if (options.format === "zip" && !tld && !q) {
    if (!batch.r2_key) {
      return Response.json({ error: "ZIP archive not found" }, { status: 404 });
    }
    const obj = await env.ARCHIVE.get(batch.r2_key);
    if (!obj) {
      return Response.json({ error: "ZIP archive missing in R2" }, { status: 404 });
    }
    return new Response(obj.body, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="domains-${date}.zip"`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  const format = options.format === "csv" ? "csv" : "txt";
  const suffix = [tld ? `tld-${tld}` : "", q ? "filtered" : ""].filter(Boolean).join("-");
  const fileName = `domains-${date}${suffix ? `-${suffix}` : ""}.${format}`;
  const contentType = format === "csv" ? "text/csv; charset=utf-8" : "text/plain; charset=utf-8";
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        if (format === "csv") {
          controller.enqueue(encoder.encode("domain,date,tld\n"));
        }

        let lastChunkIdx = -1;
        const conditions = ["day = ?", "chunk_index > ?"];
        const extraBinds: string[] = [];
        if (tld) {
          conditions.push("instr(domains_text, ?) > 0");
          extraBinds.push(`.${tld}\n`);
        }
        if (q) {
          conditions.push("instr(domains_text, ?) > 0");
          extraBinds.push(q);
        }

        const sql = `SELECT chunk_index, domains_text
                     FROM domain_chunks
                     WHERE ${conditions.join(" AND ")}
                     ORDER BY chunk_index ASC
                     LIMIT ?`;

        while (true) {
          const res = await env.DB.prepare(sql)
            .bind(date, lastChunkIdx, ...extraBinds, DOWNLOAD_WINDOW_CHUNKS)
            .all<Pick<DomainChunkRow, "chunk_index" | "domains_text">>();

          const rows = res.results ?? [];
          if (rows.length === 0) break;

          let out = "";
          for (const row of rows) {
            lastChunkIdx = row.chunk_index;
            if (!tld && !q && format === "txt") {
              const trimmed = row.domains_text.slice(1);
              out += trimmed;
              continue;
            }
            const domains = splitChunkDomains(row.domains_text);
            for (const domain of domains) {
              if (!domainMatches(domain, q, tld, "")) continue;
              if (format === "csv") {
                out += `${domain},${date},${extractTld(domain)}\n`;
              } else {
                out += `${domain}\n`;
              }
            }
          }

          if (out.length > 0) {
            controller.enqueue(encoder.encode(out));
          }

          if (rows.length < DOWNLOAD_WINDOW_CHUNKS) break;
        }

        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
