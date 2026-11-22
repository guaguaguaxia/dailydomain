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
const MAX_REGEX_LENGTH = 120;
const MAX_REGEX_CROSS_DAY_CHUNKS = 2000;
const MAX_REGEX_CROSS_DAY_MS = 12_000;

export class InvalidRegexError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidRegexError";
  }
}

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
  regex?: boolean;
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

interface QuantifierInfo {
  isQuant: boolean;
  isVariable: boolean;
  isRepeating: boolean;
  endIdx: number;
}

function readQuantifier(pattern: string, startIdx: number): QuantifierInfo {
  if (startIdx >= pattern.length) {
    return { isQuant: false, isVariable: false, isRepeating: false, endIdx: startIdx - 1 };
  }
  const ch = pattern[startIdx];
  let endIdx = startIdx;
  let isVariable = false;
  let isRepeating = false;

  if (ch === "+" || ch === "*") {
    isVariable = true;
    isRepeating = true;
  } else if (ch === "?") {
    isVariable = true;
    isRepeating = false;
  } else if (ch === "{") {
    const m = pattern.slice(startIdx).match(/^\{(\d+)(?:,(\d*))?\}/);
    if (!m) {
      return { isQuant: false, isVariable: false, isRepeating: false, endIdx: startIdx };
    }
    endIdx = startIdx + m[0].length - 1;
    const min = Number(m[1]);
    const hasComma = m[2] !== undefined;
    if (!hasComma) {
      isVariable = false;
      isRepeating = min > 1;
    } else if (m[2] === "") {
      isVariable = true;
      isRepeating = true;
    } else {
      const max = Number(m[2]);
      isVariable = min !== max;
      isRepeating = max > 1;
    }
  } else {
    return { isQuant: false, isVariable: false, isRepeating: false, endIdx: startIdx - 1 };
  }

  // Consume lazy/possessive modifier '?' after a quantifier
  if (endIdx + 1 < pattern.length && pattern[endIdx + 1] === "?") {
    endIdx += 1;
  }

  return { isQuant: true, isVariable, isRepeating, endIdx };
}

function hasNestedQuantifier(pattern: string): boolean {
  const stack: Array<{ hasVarQuant: boolean }> = [{ hasVarQuant: false }];
  let escaped = false;
  let inCharClass = false;

  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (inCharClass) {
      if (ch === "]") {
        inCharClass = false;
      }
      continue;
    }
    if (ch === "[") {
      inCharClass = true;
      continue;
    }
    if (ch === "(") {
      stack.push({ hasVarQuant: false });
      continue;
    }
    if (ch === ")") {
      const popped = stack.length > 1 ? stack.pop()! : { hasVarQuant: false };
      const qInfo = readQuantifier(pattern, i + 1);
      if (qInfo.isQuant) {
        if (popped.hasVarQuant && qInfo.isRepeating) {
          return true;
        }
        i = qInfo.endIdx;
      }
      if (popped.hasVarQuant || qInfo.isVariable) {
        stack[stack.length - 1].hasVarQuant = true;
      }
      continue;
    }
    if (ch === "+" || ch === "*" || ch === "?" || ch === "{") {
      const qInfo = readQuantifier(pattern, i);
      if (qInfo.isQuant) {
        if (qInfo.isVariable) {
          stack[stack.length - 1].hasVarQuant = true;
        }
        i = qInfo.endIdx;
      }
    }
  }

  return false;
}

export function compileDomainRegex(raw: string): { pattern: string; regex: RegExp } {
  let pattern = raw.trim();
  if (!pattern) {
    throw new InvalidRegexError("正则表达式不能为空");
  }

  const slashMatch = pattern.match(/^\/(.+)\/([a-z]*)$/i);
  if (slashMatch) {
    const flags = slashMatch[2];
    if (!/^i?$/i.test(flags)) {
      throw new InvalidRegexError("仅支持 i 标志或直接输入表达式，无需 g/m 等标志");
    }
    pattern = slashMatch[1];
  }

  if (pattern.length > MAX_REGEX_LENGTH) {
    throw new InvalidRegexError(`正则表达式长度不能超过 ${MAX_REGEX_LENGTH} 个字符`);
  }

  if (hasNestedQuantifier(pattern)) {
    throw new InvalidRegexError("不支持嵌套量词正则表达式，请简化匹配规则");
  }

  try {
    return { pattern, regex: new RegExp(pattern, "i") };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Syntax error";
    throw new InvalidRegexError(`正则表达式语法错误: ${msg}`);
  }
}

export function extractRegexHints(pattern: string): { prefixHint: string; tldHint: string } {
  let depth = 0;
  let escaped = false;
  let inCharClass = false;

  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (inCharClass) {
      if (ch === "]") {
        inCharClass = false;
      }
      continue;
    }
    if (ch === "[") {
      inCharClass = true;
      continue;
    }
    if (ch === "(") {
      depth++;
      continue;
    }
    if (ch === ")" && depth > 0) {
      depth--;
      continue;
    }
    if (ch === "|" && depth === 0) {
      return { prefixHint: "", tldHint: "" };
    }
  }

  let prefixHint = "";
  if (pattern.startsWith("^")) {
    let i = 1;
    let stopCh = "";
    while (i < pattern.length) {
      const ch = pattern[i];
      if (ch === "\\") {
        if (i + 1 < pattern.length && pattern[i + 1] === ".") {
          prefixHint += ".";
          i += 2;
          continue;
        }
        break;
      }
      if (/^[a-z0-9-]$/i.test(ch)) {
        prefixHint += ch.toLowerCase();
        i++;
        continue;
      }
      stopCh = ch;
      break;
    }
    if ((stopCh === "?" || stopCh === "*" || stopCh === "{") && prefixHint.length > 0) {
      prefixHint = prefixHint.slice(0, -1);
    }
    prefixHint = prefixHint.slice(0, 64);
  }

  const tldMatch = pattern.match(/(?:^|[^\\])(?:\\\\)*\\\.([a-z0-9]{2,24})\$$/i);
  const tldHint = tldMatch ? tldMatch[1].toLowerCase() : "";

  return { prefixHint, tldHint };
}

function splitChunkDomains(domainsText: string): string[] {
  const trimmed =
    domainsText.startsWith("\n") && domainsText.endsWith("\n")
      ? domainsText.slice(1, -1)
      : domainsText.trim();
  if (!trimmed) return [];
  return trimmed.split("\n");
}

function domainMatches(
  domain: string,
  q: string,
  tld: string,
  prefix: string,
  regexObj?: RegExp | null,
): boolean {
  if (tld && !domain.endsWith(`.${tld}`)) {
    return false;
  }
  if (prefix && !domain.startsWith(prefix)) {
    return false;
  }
  if (regexObj) {
    return regexObj.test(domain);
  }
  if (q && !domain.includes(q)) {
    return false;
  }
  return true;
}

function appendDomainChunkSqlFilters(
  conditions: string[],
  bindings: string[],
  opts: { prefixRange: string; tldFilter: string; substringQuery: string },
): void {
  if (opts.prefixRange) {
    conditions.push("last_domain >= ?", "first_domain <= ?");
    bindings.push(opts.prefixRange, `${opts.prefixRange}~`);
  }
  if (opts.tldFilter) {
    conditions.push("instr(domains_text, ?) > 0");
    bindings.push(`.${opts.tldFilter}\n`);
  }
  if (opts.substringQuery) {
    conditions.push("instr(domains_text, ?) > 0");
    bindings.push(opts.substringQuery);
  }
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

  const useRegex = Boolean(params.regex);
  const rawQuery = (params.q ?? "").trim();
  let q = "";
  let regexObj: RegExp | null = null;
  let regexHints = { prefixHint: "", tldHint: "" };
  if (useRegex && rawQuery) {
    const compiled = compileDomainRegex(rawQuery);
    q = compiled.pattern;
    regexObj = compiled.regex;
    regexHints = extractRegexHints(compiled.pattern);
  } else {
    q = normalizeQueryFilter(params.q);
  }

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

  // General path: keyword/regex q and/or prefix and/or tld
  const offset = (requestedPage - 1) * pageSize;
  const conditions: string[] = ["day = ?", "chunk_index > ?"];
  const extraBinds: string[] = [];

  appendDomainChunkSqlFilters(conditions, extraBinds, {
    prefixRange: prefix || (regexObj ? regexHints.prefixHint : ""),
    tldFilter: tld || (regexObj ? regexHints.tldHint : ""),
    substringQuery: !regexObj && q ? q : "",
  });

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
    const bindings = [date, lastChunkIdx, ...extraBinds, SCAN_WINDOW_CHUNKS];
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
        if (!domainMatches(domain, q, tld, prefix, regexObj)) {
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
  params: { q: string; tld?: string; limit?: number; regex?: boolean },
): Promise<CrossDaySearchResult> {
  const useRegex = Boolean(params.regex);
  let q = "";
  let regexObj: RegExp | null = null;
  let regexHints = { prefixHint: "", tldHint: "" };

  if (useRegex) {
    const compiled = compileDomainRegex(params.q ?? "");
    q = compiled.pattern;
    regexObj = compiled.regex;
    regexHints = extractRegexHints(compiled.pattern);
  } else {
    q = normalizeQueryFilter(params.q);
    if (q.length < 2) {
      throw new Error("Search query must be at least 2 characters");
    }
  }

  const tld = normalizeTldFilter(params.tld);
  const limit = clamp(Math.floor(params.limit ?? 100), 10, 500);

  const daysRes = await env.DB.prepare(
    "SELECT day FROM daily_batches WHERE status = 'completed' ORDER BY day DESC LIMIT 90",
  ).all<{ day: string }>();

  const completedDays = (daysRes.results ?? []).map((r) => r.day);
  const items: CrossDaySearchItem[] = [];
  const perDayCounts: Array<{ day: string; count: number }> = [];
  let truncated = false;
  let chunksScanned = 0;
  const startedAt = Date.now();

  for (const day of completedDays) {
    if (items.length >= limit) {
      truncated = true;
      break;
    }
    if (useRegex && (chunksScanned >= MAX_REGEX_CROSS_DAY_CHUNKS || Date.now() - startedAt >= MAX_REGEX_CROSS_DAY_MS)) {
      truncated = true;
      break;
    }

    let lastChunkIdx = -1;
    let dayMatches = 0;

    const conditions = ["day = ?", "chunk_index > ?"];
    const extraBinds: string[] = [];
    appendDomainChunkSqlFilters(conditions, extraBinds, {
      prefixRange: regexObj ? regexHints.prefixHint : "",
      tldFilter: tld || (regexObj ? regexHints.tldHint : ""),
      substringQuery: regexObj ? "" : q,
    });

    const sql = `SELECT chunk_index, domains_text
                 FROM domain_chunks
                 WHERE ${conditions.join(" AND ")}
                 ORDER BY chunk_index ASC
                 LIMIT ?`;

    while (true) {
      if (useRegex && (chunksScanned >= MAX_REGEX_CROSS_DAY_CHUNKS || Date.now() - startedAt >= MAX_REGEX_CROSS_DAY_MS)) {
        truncated = true;
        break;
      }

      const res = await env.DB.prepare(sql)
        .bind(day, lastChunkIdx, ...extraBinds, SCAN_WINDOW_CHUNKS)
        .all<Pick<DomainChunkRow, "chunk_index" | "domains_text">>();

      const rows = res.results ?? [];
      chunksScanned += rows.length;
      if (rows.length === 0) break;

      for (const row of rows) {
        lastChunkIdx = row.chunk_index;
        const domains = splitChunkDomains(row.domains_text);
        for (const domain of domains) {
          if (!domainMatches(domain, q, tld, "", regexObj)) continue;
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
    if (truncated) {
      break;
    }
  }

  return {
    query: q,
    regex: useRegex,
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
  options: { format: "txt" | "csv" | "zip"; tld?: string; q?: string; regex?: boolean },
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

  const useRegex = Boolean(options.regex);
  const rawQuery = (options.q ?? "").trim();
  let q = "";
  let regexObj: RegExp | null = null;
  let regexHints = { prefixHint: "", tldHint: "" };
  if (useRegex && rawQuery) {
    try {
      const compiled = compileDomainRegex(rawQuery);
      q = compiled.pattern;
      regexObj = compiled.regex;
      regexHints = extractRegexHints(compiled.pattern);
    } catch (err) {
      if (err instanceof InvalidRegexError) {
        return Response.json({ error: err.message }, { status: 400 });
      }
      throw err;
    }
  } else {
    q = normalizeQueryFilter(options.q);
  }

  const tld = normalizeTldFilter(options.tld);

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
  const suffix = [tld ? `tld-${tld}` : "", q ? (regexObj ? "regex" : "filtered") : ""].filter(Boolean).join("-");
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
        appendDomainChunkSqlFilters(conditions, extraBinds, {
          prefixRange: regexObj ? regexHints.prefixHint : "",
          tldFilter: tld || (regexObj ? regexHints.tldHint : ""),
          substringQuery: !regexObj && q ? q : "",
        });

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
              if (!domainMatches(domain, q, tld, "", regexObj)) continue;
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
