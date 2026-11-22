import {
  buildClearCookie,
  buildSessionCookie,
  createSessionToken,
  isAuthenticated,
  verifyPassword,
} from "./auth";
import {
  getDayDetail,
  getOverview,
  queryDayDomains,
  searchAcrossDays,
  streamDayDownload,
} from "./queries";
import { formatUtcDate, isValidDate, syncDay, syncScheduledRecentDays } from "./sync";
import type { Env, SyncDayResult } from "./types";
import { renderAppPage, renderLoginPage, sanitizeNextPath } from "./ui";

const MAX_SYNC_DATES_PER_REQUEST = 7;

function withSecurityHeaders(response: Response, isDownload = false): Response {
  const headers = new Headers(response.headers);
  headers.set("X-Robots-Tag", "noindex, nofollow");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "no-referrer");
  if (!isDownload && !headers.has("Cache-Control")) {
    headers.set("Cache-Control", "private, no-store");
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function htmlResponse(html: string, status = 200, extraHeaders?: HeadersInit): Response {
  const headers = new Headers(extraHeaders);
  headers.set("Content-Type", "text/html; charset=utf-8");
  return withSecurityHeaders(new Response(html, { status, headers }));
}

function jsonResponse(data: unknown, status = 200, extraHeaders?: HeadersInit): Response {
  const headers = new Headers(extraHeaders);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return withSecurityHeaders(new Response(JSON.stringify(data), { status, headers }));
}

async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const { pathname } = url;
  const method = request.method.toUpperCase();

  // Public health check (no sensitive data exposed)
  if (pathname === "/api/health" && method === "GET") {
    return jsonResponse({ ok: true, service: "dailydomain" });
  }

  // Login page & auth endpoints
  if (pathname === "/login" && method === "GET") {
    const authed = await isAuthenticated(request, env);
    const next = sanitizeNextPath(url.searchParams.get("next"));
    if (authed) {
      return withSecurityHeaders(Response.redirect(new URL(next, url.origin).toString(), 302));
    }
    return htmlResponse(renderLoginPage(next));
  }

  if (pathname === "/api/auth/login" && method === "POST") {
    let body: { password?: unknown } | null = null;
    try {
      body = (await request.json()) as { password?: unknown };
    } catch {
      return jsonResponse({ error: "请求体必须为 JSON" }, 400);
    }

    const provided = typeof body?.password === "string" ? body.password : "";
    if (!provided || !(await verifyPassword(provided, env.ACCESS_PASSWORD))) {
      console.log(JSON.stringify({ event: "auth_failed", path: pathname }));
      return jsonResponse({ error: "访问密码不正确" }, 401);
    }

    const token = await createSessionToken(env.SESSION_SECRET);
    const cookie = buildSessionCookie(token, url);
    console.log(JSON.stringify({ event: "auth_success", path: pathname }));
    return jsonResponse({ ok: true }, 200, { "Set-Cookie": cookie });
  }

  if (pathname === "/api/auth/logout" && method === "POST") {
    return jsonResponse({ ok: true }, 200, { "Set-Cookie": buildClearCookie(url) });
  }

  // Enforce authentication for all remaining UI & API routes
  const authed = await isAuthenticated(request, env);
  if (!authed) {
    if (pathname.startsWith("/api/")) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
    const nextTarget = `${pathname}${url.search}`;
    const loginUrl = new URL("/login", url.origin);
    loginUrl.searchParams.set("next", sanitizeNextPath(nextTarget));
    return withSecurityHeaders(Response.redirect(loginUrl.toString(), 302));
  }

  // Protected UI routes
  if (method === "GET" && pathname === "/") {
    return htmlResponse(renderAppPage());
  }

  const dayPageMatch = pathname.match(/^\/day\/(\d{4}-\d{2}-\d{2})$/);
  if (method === "GET" && dayPageMatch) {
    const day = dayPageMatch[1];
    if (!isValidDate(day)) {
      return htmlResponse(renderAppPage(), 400);
    }
    return htmlResponse(renderAppPage(day));
  }

  // Protected API routes
  if (method === "GET" && pathname === "/api/overview") {
    const overview = await getOverview(env);
    return jsonResponse(overview);
  }

  const dayDetailMatch = pathname.match(/^\/api\/days\/(\d{4}-\d{2}-\d{2})$/);
  if (method === "GET" && dayDetailMatch) {
    const date = dayDetailMatch[1];
    if (!isValidDate(date)) {
      return jsonResponse({ error: "Invalid date format" }, 400);
    }
    const detail = await getDayDetail(env, date);
    if (!detail) {
      return jsonResponse({ error: "Date not found" }, 404);
    }
    return jsonResponse(detail);
  }

  const dayDomainsMatch = pathname.match(/^\/api\/days\/(\d{4}-\d{2}-\d{2})\/domains$/);
  if (method === "GET" && dayDomainsMatch) {
    const date = dayDomainsMatch[1];
    if (!isValidDate(date)) {
      return jsonResponse({ error: "Invalid date format" }, 400);
    }
    const pageRaw = Number(url.searchParams.get("page") ?? "1");
    const pageSizeRaw = Number(url.searchParams.get("pageSize") ?? "100");
    const result = await queryDayDomains(env, date, {
      q: url.searchParams.get("q") ?? undefined,
      tld: url.searchParams.get("tld") ?? undefined,
      prefix: url.searchParams.get("prefix") ?? undefined,
      page: Number.isFinite(pageRaw) ? pageRaw : 1,
      pageSize: Number.isFinite(pageSizeRaw) ? pageSizeRaw : 100,
    });
    if (!result) {
      return jsonResponse({ error: "Date not found" }, 404);
    }
    return jsonResponse(result);
  }

  const dayDownloadMatch = pathname.match(/^\/api\/days\/(\d{4}-\d{2}-\d{2})\/download$/);
  if (method === "GET" && dayDownloadMatch) {
    const date = dayDownloadMatch[1];
    const fmtRaw = (url.searchParams.get("format") ?? "txt").toLowerCase();
    const format = fmtRaw === "zip" ? "zip" : fmtRaw === "csv" ? "csv" : "txt";
    const resp = await streamDayDownload(env, date, {
      format,
      tld: url.searchParams.get("tld") ?? undefined,
      q: url.searchParams.get("q") ?? undefined,
    });
    return withSecurityHeaders(resp, true);
  }

  if (method === "GET" && pathname === "/api/search") {
    const q = (url.searchParams.get("q") ?? "").trim();
    if (q.length < 2) {
      return jsonResponse({ error: "Parameter 'q' must be at least 2 characters" }, 400);
    }
    const limitRaw = Number(url.searchParams.get("limit") ?? "100");
    const result = await searchAcrossDays(env, {
      q,
      tld: url.searchParams.get("tld") ?? undefined,
      limit: Number.isFinite(limitRaw) ? limitRaw : 100,
    });
    return jsonResponse(result);
  }

  if (method === "POST" && pathname === "/api/sync") {
    let body: { date?: unknown; dates?: unknown; force?: unknown } = {};
    try {
      const text = await request.text();
      if (text.trim()) {
        body = JSON.parse(text) as { date?: unknown; dates?: unknown; force?: unknown };
      }
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const force = Boolean(body.force);
    let targetDates: string[] = [];

    if (Array.isArray(body.dates)) {
      targetDates = body.dates.filter((d): d is string => typeof d === "string");
    } else if (typeof body.date === "string" && body.date.trim()) {
      targetDates = [body.date.trim()];
    } else {
      targetDates = [formatUtcDate(Date.now())];
    }

    if (targetDates.length === 0 || targetDates.length > MAX_SYNC_DATES_PER_REQUEST) {
      return jsonResponse(
        { error: `Specify between 1 and ${MAX_SYNC_DATES_PER_REQUEST} dates per sync request` },
        400,
      );
    }

    for (const d of targetDates) {
      if (!isValidDate(d)) {
        return jsonResponse({ error: `Invalid date: ${d}` }, 400);
      }
    }

    const results: SyncDayResult[] = [];
    for (const d of targetDates) {
      results.push(await syncDay(env, d, { force }));
    }

    return jsonResponse({ ok: true, results });
  }

  return jsonResponse({ error: "Not found" }, 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await handleRequest(request, env);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal server error";
      console.error(
        JSON.stringify({
          event: "unhandled_fetch_error",
          method: request.method,
          path: new URL(request.url).pathname,
          error: message,
        }),
      );
      return jsonResponse({ error: "Internal server error" }, 500);
    }
  },

  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    try {
      await syncScheduledRecentDays(env, controller.scheduledTime);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unhandled scheduled error";
      console.error(
        JSON.stringify({
          event: "unhandled_scheduled_error",
          cron: controller.cron,
          error: message,
        }),
      );
    }
  },
} satisfies ExportedHandler<Env>;
