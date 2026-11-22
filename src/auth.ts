import type { Env } from "./types";

const SESSION_COOKIE_NAME = "dd_session";
const DEFAULT_TTL_SECONDS = 30 * 24 * 60 * 60;

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(input: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]+$/.test(input)) {
    return null;
  }
  const padded = input.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (input.length % 4)) % 4);
  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(new ArrayBuffer(binary.length));
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  const encoded = new TextEncoder().encode(secret);
  return crypto.subtle.importKey("raw", encoded, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

function timingSafeEqualBuffers(a: ArrayBuffer, b: ArrayBuffer): boolean {
  const subtleWithTse = crypto.subtle as SubtleCrypto & {
    timingSafeEqual?: (left: ArrayBuffer | ArrayBufferView, right: ArrayBuffer | ArrayBufferView) => boolean;
  };
  if (typeof subtleWithTse.timingSafeEqual === "function") {
    return subtleWithTse.timingSafeEqual(a, b);
  }
  const viewA = new Uint8Array(a);
  const viewB = new Uint8Array(b);
  if (viewA.length !== viewB.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < viewA.length; i++) {
    diff |= viewA[i] ^ viewB[i];
  }
  return diff === 0;
}

/**
 * Constant-time string verification using SHA-256 digests so lengths never short-circuit.
 */
export async function verifyPassword(provided: string, expected: string): Promise<boolean> {
  if (!expected) {
    return false;
  }
  const encoder = new TextEncoder();
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  return timingSafeEqualBuffers(providedHash, expectedHash);
}

/**
 * Generates a signed stateless session token `<exp>.<nonceHex>.<sigB64Url>`.
 */
export async function createSessionToken(secret: string, ttlSeconds = DEFAULT_TTL_SECONDS): Promise<string> {
  if (!secret) {
    throw new Error("SESSION_SECRET is not configured");
  }
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const nonceBytes = new Uint8Array(16);
  crypto.getRandomValues(nonceBytes);
  const nonceHex = Array.from(nonceBytes, (b) => b.toString(16).padStart(2, "0")).join("");
  const payload = `${exp}.${nonceHex}`;
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return `${payload}.${toBase64Url(new Uint8Array(signature))}`;
}

/**
 * Verifies an HMAC-signed session token and checks its expiration timestamp.
 */
export async function verifySessionToken(
  token: string,
  secret: string,
  nowSec = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (!token || !secret) {
    return false;
  }
  const parts = token.split(".");
  if (parts.length !== 3) {
    return false;
  }
  const [expRaw, nonceHex, sigB64Url] = parts;
  if (!/^\d+$/.test(expRaw) || !/^[0-9a-f]{32}$/.test(nonceHex)) {
    return false;
  }
  const exp = Number(expRaw);
  if (!Number.isSafeInteger(exp) || exp <= nowSec) {
    return false;
  }
  const sigBytes = fromBase64Url(sigB64Url);
  if (!sigBytes) {
    return false;
  }

  const payload = `${expRaw}.${nonceHex}`;
  const key = await importHmacKey(secret);
  return crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(payload));
}

export function getCookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) {
    return null;
  }
  const cookies = cookieHeader.split(";");
  for (const part of cookies) {
    const eqIndex = part.indexOf("=");
    if (eqIndex <= 0) continue;
    const key = part.slice(0, eqIndex).trim();
    if (key === name) {
      return part.slice(eqIndex + 1).trim();
    }
  }
  return null;
}

export async function isAuthenticated(request: Request, env: Env): Promise<boolean> {
  const authHeader = request.headers.get("Authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const bearer = authHeader.slice(7).trim();
    if (await verifyPassword(bearer, env.ACCESS_PASSWORD)) {
      return true;
    }
  }

  const sessionToken = getCookieValue(request.headers.get("Cookie"), SESSION_COOKIE_NAME);
  if (sessionToken && (await verifySessionToken(sessionToken, env.SESSION_SECRET))) {
    return true;
  }

  return false;
}

export function buildSessionCookie(token: string, requestUrl: URL, maxAgeSec = DEFAULT_TTL_SECONDS): string {
  const isLocal = requestUrl.hostname === "localhost" || requestUrl.hostname === "127.0.0.1";
  const securePart = isLocal ? "" : "; Secure";
  return `${SESSION_COOKIE_NAME}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSec}${securePart}`;
}

export function buildClearCookie(requestUrl: URL): string {
  const isLocal = requestUrl.hostname === "localhost" || requestUrl.hostname === "127.0.0.1";
  const securePart = isLocal ? "" : "; Secure";
  return `${SESSION_COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${securePart}`;
}
