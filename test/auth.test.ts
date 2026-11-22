import { describe, expect, it } from "vitest";
import {
  buildClearCookie,
  buildSessionCookie,
  createSessionToken,
  isAuthenticated,
  verifyPassword,
  verifySessionToken,
} from "../src/auth";
import type { Env } from "../src/types";

const mockEnv = {
  ACCESS_PASSWORD: "super-secret-password-123",
  SESSION_SECRET: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
} as unknown as Env;

describe("auth helpers", () => {
  it("verifies passwords with constant-time digest comparison", async () => {
    expect(await verifyPassword("super-secret-password-123", mockEnv.ACCESS_PASSWORD)).toBe(true);
    expect(await verifyPassword("super-secret-password-124", mockEnv.ACCESS_PASSWORD)).toBe(false);
    expect(await verifyPassword("short", mockEnv.ACCESS_PASSWORD)).toBe(false);
    expect(await verifyPassword("any", "")).toBe(false);
  });

  it("creates and verifies signed session tokens", async () => {
    const token = await createSessionToken(mockEnv.SESSION_SECRET, 3600);
    const parts = token.split(".");
    expect(parts).toHaveLength(3);

    expect(await verifySessionToken(token, mockEnv.SESSION_SECRET)).toBe(true);
    expect(await verifySessionToken(token, "wrong-secret")).toBe(false);

    // Tamper expiration
    const tampered = `${Number(parts[0]) + 100}.${parts[1]}.${parts[2]}`;
    expect(await verifySessionToken(tampered, mockEnv.SESSION_SECRET)).toBe(false);

    // Expired
    const futureNow = Number(parts[0]) + 10;
    expect(await verifySessionToken(token, mockEnv.SESSION_SECRET, futureNow)).toBe(false);
  });

  it("builds secure cookies for production and non-secure for localhost", () => {
    const prodCookie = buildSessionCookie("tok", new URL("https://domains.guaxiaai.com/"));
    expect(prodCookie).toContain("HttpOnly");
    expect(prodCookie).toContain("SameSite=Lax");
    expect(prodCookie).toContain("; Secure");

    const localCookie = buildSessionCookie("tok", new URL("http://localhost:8787/"));
    expect(localCookie).not.toContain("; Secure");

    const cleared = buildClearCookie(new URL("https://domains.guaxiaai.com/"));
    expect(cleared).toContain("Max-Age=0");
  });

  it("authenticates via Bearer token or session cookie", async () => {
    const unauthReq = new Request("https://domains.guaxiaai.com/api/overview");
    expect(await isAuthenticated(unauthReq, mockEnv)).toBe(false);

    const bearerReq = new Request("https://domains.guaxiaai.com/api/overview", {
      headers: { Authorization: `Bearer ${mockEnv.ACCESS_PASSWORD}` },
    });
    expect(await isAuthenticated(bearerReq, mockEnv)).toBe(true);

    const badBearerReq = new Request("https://domains.guaxiaai.com/api/overview", {
      headers: { Authorization: "Bearer wrong" },
    });
    expect(await isAuthenticated(badBearerReq, mockEnv)).toBe(false);

    const token = await createSessionToken(mockEnv.SESSION_SECRET);
    const cookieReq = new Request("https://domains.guaxiaai.com/api/overview", {
      headers: { Cookie: `foo=bar; dd_session=${token}` },
    });
    expect(await isAuthenticated(cookieReq, mockEnv)).toBe(true);
  });
});
