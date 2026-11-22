import { deflateRawSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import {
  getDayDetail,
  getOverview,
  queryDayDomains,
  searchAcrossDays,
  streamDayDownload,
} from "../src/queries";
import { parseDomainsToChunks, syncDay } from "../src/sync";
import type { DailyBatchRow, DomainChunkRow, Env } from "../src/types";

interface TldRow {
  day: string;
  tld: string;
  domain_count: number;
}

function createInMemoryEnv() {
  const batches = new Map<string, DailyBatchRow>();
  const tlds: TldRow[] = [];
  const chunks: DomainChunkRow[] = [];
  const r2Store = new Map<string, Uint8Array>();

  function runSql(sql: string, params: unknown[]) {
    const s = sql.replace(/\s+/g, " ").trim();

    if (s.startsWith("SELECT status, total_count, tld_count")) {
      const day = params[0] as string;
      const b = batches.get(day);
      return b ? [b] : [];
    }

    if (s.startsWith("INSERT INTO daily_batches (day, status, error_message")) {
      const [day, status, error_message] = params as [string, DailyBatchRow["status"], string | null];
      const existing = batches.get(day);
      const now = new Date().toISOString();
      batches.set(day, {
        day,
        total_count: existing?.total_count ?? 0,
        tld_count: existing?.tld_count ?? 0,
        chunk_count: existing?.chunk_count ?? 0,
        chunk_size: existing?.chunk_size ?? 1000,
        zip_size_bytes: existing?.zip_size_bytes ?? 0,
        raw_size_bytes: existing?.raw_size_bytes ?? 0,
        r2_key: existing?.r2_key ?? null,
        source_etag: existing?.source_etag ?? null,
        source_last_modified: existing?.source_last_modified ?? null,
        status,
        error_message,
        synced_at: existing?.synced_at ?? null,
        duration_ms: existing?.duration_ms ?? null,
        created_at: existing?.created_at ?? now,
        updated_at: now,
      });
      return [];
    }

    if (s.startsWith("INSERT INTO daily_batches ( day, total_count")) {
      const [
        day,
        total_count,
        tld_count,
        chunk_count,
        chunk_size,
        zip_size_bytes,
        raw_size_bytes,
        r2_key,
        source_etag,
        source_last_modified,
        synced_at,
        duration_ms,
      ] = params as [
        string,
        number,
        number,
        number,
        number,
        number,
        number,
        string,
        string | null,
        string | null,
        string,
        number,
      ];
      const now = new Date().toISOString();
      batches.set(day, {
        day,
        total_count,
        tld_count,
        chunk_count,
        chunk_size,
        zip_size_bytes,
        raw_size_bytes,
        r2_key,
        source_etag,
        source_last_modified,
        status: "completed",
        error_message: null,
        synced_at,
        duration_ms,
        created_at: batches.get(day)?.created_at ?? now,
        updated_at: now,
      });
      return [];
    }

    if (s.startsWith("DELETE FROM domain_chunks WHERE day = ?")) {
      const day = params[0] as string;
      for (let i = chunks.length - 1; i >= 0; i--) {
        if (chunks[i].day === day) chunks.splice(i, 1);
      }
      return [];
    }

    if (s.startsWith("DELETE FROM daily_tld_stats WHERE day = ?")) {
      const day = params[0] as string;
      for (let i = tlds.length - 1; i >= 0; i--) {
        if (tlds[i].day === day) tlds.splice(i, 1);
      }
      return [];
    }

    if (s.startsWith("INSERT INTO domain_chunks")) {
      const [day, chunk_index, start_offset, domain_count, first_domain, last_domain, domains_text] =
        params as [string, number, number, number, string, string, string];
      chunks.push({
        day,
        chunk_index,
        start_offset,
        domain_count,
        first_domain,
        last_domain,
        domains_text,
      });
      return [];
    }

    if (s.startsWith("INSERT INTO daily_tld_stats")) {
      for (let i = 0; i < params.length; i += 3) {
        tlds.push({
          day: params[i] as string,
          tld: params[i + 1] as string,
          domain_count: params[i + 2] as number,
        });
      }
      return [];
    }

    if (s.startsWith("SELECT day, total_count, tld_count, chunk_count")) {
      return Array.from(batches.values()).sort((a, b) => b.day.localeCompare(a.day));
    }

    if (s.startsWith("SELECT s.tld AS tld, SUM(s.domain_count)")) {
      const sums = new Map<string, number>();
      for (const r of tlds) {
        if (batches.get(r.day)?.status === "completed") {
          sums.set(r.tld, (sums.get(r.tld) ?? 0) + r.domain_count);
        }
      }
      return Array.from(sums.entries())
        .map(([tld, domain_count]) => ({ tld, domain_count }))
        .sort((a, b) => b.domain_count - a.domain_count || a.tld.localeCompare(b.tld))
        .slice(0, 20);
    }

    if (s.startsWith("SELECT day, total_count, tld_count") || s.includes("FROM daily_batches WHERE day = ?")) {
      const day = params[0] as string;
      const b = batches.get(day);
      return b ? [b] : [];
    }

    if (s.startsWith("SELECT tld, domain_count FROM daily_tld_stats WHERE day = ?")) {
      const day = params[0] as string;
      return tlds
        .filter((r) => r.day === day)
        .sort((a, b) => b.domain_count - a.domain_count || a.tld.localeCompare(b.tld))
        .slice(0, 40);
    }

    if (s.startsWith("SELECT day FROM daily_batches WHERE day < ?")) {
      const day = params[0] as string;
      return Array.from(batches.values())
        .filter((b) => b.day < day && b.status === "completed")
        .sort((a, b) => b.day.localeCompare(a.day))
        .slice(0, 1)
        .map((b) => ({ day: b.day }));
    }

    if (s.startsWith("SELECT day FROM daily_batches WHERE day > ?")) {
      const day = params[0] as string;
      return Array.from(batches.values())
        .filter((b) => b.day > day && b.status === "completed")
        .sort((a, b) => a.day.localeCompare(b.day))
        .slice(0, 1)
        .map((b) => ({ day: b.day }));
    }

    if (s.startsWith("SELECT domain_count FROM daily_tld_stats WHERE day = ? AND tld = ?")) {
      const [day, tld] = params as [string, string];
      const hit = tlds.find((r) => r.day === day && r.tld === tld);
      return hit ? [{ domain_count: hit.domain_count }] : [];
    }

    if (s.startsWith("SELECT day FROM daily_batches WHERE status = 'completed'")) {
      return Array.from(batches.values())
        .filter((b) => b.status === "completed")
        .sort((a, b) => b.day.localeCompare(a.day))
        .map((b) => ({ day: b.day }));
    }

    if (s.includes("FROM domain_chunks WHERE")) {
      const day = params[0] as string;
      let filtered = chunks.filter((c) => c.day === day).sort((a, b) => a.chunk_index - b.chunk_index);

      if (s.includes("chunk_index >= ? AND chunk_index <= ?")) {
        const [, startIdx, endIdx] = params as [string, number, number];
        return filtered.filter((c) => c.chunk_index >= startIdx && c.chunk_index <= endIdx);
      }

      const lastIdx = params[1] as number;
      filtered = filtered.filter((c) => c.chunk_index > lastIdx);

      let pIdx = 2;
      if (s.includes("last_domain >= ? AND first_domain <= ?")) {
        const minPrefix = params[pIdx++] as string;
        const maxPrefix = params[pIdx++] as string;
        filtered = filtered.filter((c) => c.last_domain >= minPrefix && c.first_domain <= maxPrefix);
      }

      const instrCount = (s.match(/instr\(domains_text, \?\) > 0/g) || []).length;
      for (let i = 0; i < instrCount; i++) {
        const needle = params[pIdx++] as string;
        filtered = filtered.filter((c) => c.domains_text.includes(needle));
      }

      const limit = params[pIdx] as number;
      return filtered.slice(0, limit);
    }

    throw new Error(`Unhandled mock SQL: ${s}`);
  }

  function makeStatement(sql: string, params: unknown[] = []) {
    return {
      bind(...args: unknown[]) {
        return makeStatement(sql, args);
      },
      async first<T>() {
        const rows = runSql(sql, params);
        return (rows[0] as T | undefined) ?? null;
      },
      async all<T>() {
        return { results: runSql(sql, params) as T[] };
      },
      async run() {
        runSql(sql, params);
        return { success: true };
      },
    };
  }

  const env = {
    DB: {
      prepare(sql: string) {
        return makeStatement(sql);
      },
      async batch(stmts: Array<{ run: () => Promise<unknown> }>) {
        const out = [];
        for (const st of stmts) {
          out.push(await st.run());
        }
        return out;
      },
    } as unknown as D1Database,
    ARCHIVE: {
      async put(key: string, value: Uint8Array) {
        r2Store.set(key, new Uint8Array(value));
      },
      async get(key: string) {
        const bytes = r2Store.get(key);
        if (!bytes) return null;
        return {
          body: new ReadableStream({
            start(controller) {
              controller.enqueue(bytes);
              controller.close();
            },
          }),
        };
      },
    } as unknown as R2Bucket,
    WHOISEXTRACTOR_PID: "10",
    WHOISEXTRACTOR_API_KEY: "test-api-key",
    ACCESS_PASSWORD: "test-password",
    SESSION_SECRET: "test-session-secret",
  } as Env;

  return { env, batches, chunks, r2Store };
}

function makeSimpleDeflatedZip(fileName: string, content: string): Uint8Array {
  const nameBytes = Buffer.from(fileName, "utf8");
  const raw = Buffer.from(content, "utf8");
  const compressed = deflateRawSync(raw);

  const lfh = Buffer.alloc(30);
  lfh.writeUInt32LE(0x04034b50, 0);
  lfh.writeUInt16LE(20, 4);
  lfh.writeUInt16LE(8, 8);
  lfh.writeUInt32LE(compressed.length, 18);
  lfh.writeUInt32LE(raw.length, 22);
  lfh.writeUInt16LE(nameBytes.length, 26);

  const cd = Buffer.alloc(46);
  cd.writeUInt32LE(0x02014b50, 0);
  cd.writeUInt16LE(20, 4);
  cd.writeUInt16LE(20, 6);
  cd.writeUInt16LE(8, 10);
  cd.writeUInt32LE(compressed.length, 20);
  cd.writeUInt32LE(raw.length, 24);
  cd.writeUInt16LE(nameBytes.length, 28);

  const cdOffset = lfh.length + nameBytes.length + compressed.length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(cd.length + nameBytes.length, 12);
  eocd.writeUInt32LE(cdOffset, 16);

  return new Uint8Array(Buffer.concat([lfh, nameBytes, compressed, cd, nameBytes, eocd]));
}

describe("parseDomainsToChunks", () => {
  it("parses sorted domains into fixed-size chunks with deduplication and TLD counts", () => {
    const input = [
      "Alpha.com",
      "alpha.com",
      "invalid-line-no-dot",
      "beta.ai",
      "gamma.ai",
      "delta.org", // out of order vs gamma -> triggers sorted fallback
    ].join("\n");

    const parsed = parseDomainsToChunks(input, 2);
    expect(parsed.totalCount).toBe(4);
    expect(parsed.chunks).toHaveLength(2);
    expect(parsed.chunks[0]).toMatchObject({
      chunkIndex: 0,
      startOffset: 0,
      domainCount: 2,
      firstDomain: "alpha.com",
      lastDomain: "beta.ai",
      domainsText: "\nalpha.com\nbeta.ai\n",
    });
    expect(parsed.chunks[1]).toMatchObject({
      chunkIndex: 1,
      startOffset: 2,
      domainCount: 2,
      firstDomain: "delta.org",
      lastDomain: "gamma.ai",
      domainsText: "\ndelta.org\ngamma.ai\n",
    });
    expect(parsed.tldCounts.get("ai")).toBe(2);
    expect(parsed.tldCounts.get("com")).toBe(1);
    expect(parsed.tldCounts.get("org")).toBe(1);
  });

  it("uses sorted fast path cleanly when already sorted", () => {
    const input = "a.com\r\nb.com\r\nc.net\r\nd.io\r\ne.ai\r\n";
    const parsed = parseDomainsToChunks(input, 3);
    expect(parsed.totalCount).toBe(5);
    expect(parsed.chunks).toHaveLength(2);
    expect(parsed.chunks[0].domainCount).toBe(3);
    expect(parsed.chunks[1].domainCount).toBe(2);
    expect(parsed.chunks[1].startOffset).toBe(3);
  });
});

describe("syncDay and queries integration", () => {
  it("syncs multiple days, handles 404 unavailable, queries filters, and streams downloads", async () => {
    const { env } = createInMemoryEnv();

    const day1Domains = Array.from({ length: 45 }, (_, i) => {
      const idx = String(i).padStart(2, "0");
      return i % 3 === 0 ? `openai-${idx}.ai` : `site-${idx}.com`;
    })
      .sort()
      .join("\n");

    const day2Domains = ["agenthub.ai", "cloudlab.dev", "openai-next.com"].join("\n");

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const u = String(input);
      if (u.includes("date=2026-11-21")) {
        return new Response(makeSimpleDeflatedZip("dailyupdate.txt", day1Domains), {
          status: 200,
          headers: { "Content-Type": "application/zip", ETag: '"e1"' },
        });
      }
      if (u.includes("date=2026-11-22")) {
        return new Response(makeSimpleDeflatedZip("dailyupdate.txt", day2Domains), {
          status: 200,
          headers: { "Content-Type": "application/zip", ETag: '"e2"' },
        });
      }
      return new Response(JSON.stringify({ error: "No data for this date" }), { status: 404 });
    });

    vi.stubGlobal("fetch", fetchMock);
    try {
      const res1 = await syncDay(env, "2026-11-21");
      expect(res1.status).toBe("completed");
      expect(res1.totalCount).toBe(45);

      const res2 = await syncDay(env, "2026-11-22");
      expect(res2.status).toBe("completed");
      expect(res2.totalCount).toBe(3);

      const resMissing = await syncDay(env, "2026-11-23");
      expect(resMissing.status).toBe("unavailable");

      // Skips already-completed day when force=false
      const resSkip = await syncDay(env, "2026-11-22");
      expect(resSkip.skipped).toBe(true);

      const overview = await getOverview(env);
      expect(overview.totalDays).toBe(2);
      expect(overview.totalDomains).toBe(48);
      expect(overview.latestDay?.day).toBe("2026-11-22");

      const detail = await getDayDetail(env, "2026-11-21");
      expect(detail?.nextDay).toBe("2026-11-22");
      expect(detail?.prevDay).toBeNull();

      // Pagination (pageSize clamped >= 20)
      const p1 = await queryDayDomains(env, "2026-11-21", { page: 1, pageSize: 20 });
      expect(p1?.total).toBe(45);
      expect(p1?.items).toHaveLength(20);
      expect(p1?.items[0].rank).toBe(1);

      const p3 = await queryDayDomains(env, "2026-11-21", { page: 3, pageSize: 20 });
      expect(p3?.items).toHaveLength(5);
      expect(p3?.items[0].rank).toBe(41);

      // TLD-only fast path
      const aiOnly = await queryDayDomains(env, "2026-11-21", { tld: "ai", page: 1, pageSize: 20 });
      expect(aiOnly?.total).toBe(15);
      expect(aiOnly?.items.every((i) => i.tld === "ai")).toBe(true);

      // Keyword + prefix filter + out-of-range page clamp
      const filtered = await queryDayDomains(env, "2026-11-21", {
        q: "openai",
        prefix: "o",
        page: 5,
        pageSize: 20,
      });
      expect(filtered?.total).toBe(15);
      expect(filtered?.page).toBe(1);
      expect(filtered?.items).toHaveLength(15);

      // Cross-day search
      const cross = await searchAcrossDays(env, { q: "openai", limit: 50 });
      expect(cross.totalReturned).toBe(16);
      expect(cross.perDayCounts).toEqual([
        { day: "2026-11-22", count: 1 },
        { day: "2026-11-21", count: 15 },
      ]);

      // Downloads
      const txtResp = await streamDayDownload(env, "2026-11-22", { format: "txt", tld: "ai" });
      expect(await txtResp.text()).toBe("agenthub.ai\n");

      const csvResp = await streamDayDownload(env, "2026-11-22", { format: "csv" });
      const csvText = await csvResp.text();
      expect(csvText).toContain("domain,date,tld\n");
      expect(csvText).toContain("cloudlab.dev,2026-11-22,dev\n");

      const zipResp = await streamDayDownload(env, "2026-11-22", { format: "zip" });
      const zipBuf = new Uint8Array(await zipResp.arrayBuffer());
      expect(zipBuf[0]).toBe(0x50);
      expect(zipBuf[1]).toBe(0x4b);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
