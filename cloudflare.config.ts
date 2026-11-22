/**
 * Non-secret Cloudflare Workers deployment configuration reference for DailyDomain.
 * Secrets MUST NOT be stored in this file; set them directly via Cloudflare Dashboard / API / cf secrets.
 */
export const cloudflareConfig = {
  workerName: "dailydomain",
  mainModule: "dist/worker.js",
  compatibilityDate: "2026-11-22",
  compatibilityFlags: ["nodejs_compat"],
  usageModel: "standard",
  limits: {
    cpuMs: 30_000,
  },
  observability: {
    enabled: true,
    headSamplingRate: 1,
    logs: {
      enabled: true,
      invocationLogs: true,
      persist: true,
      headSamplingRate: 1,
    },
    traces: {
      enabled: true,
      persist: true,
      headSamplingRate: 1,
    },
  },
  customDomain: {
    hostname: "domains.guaxiaai.com",
    zoneName: "guaxiaai.com",
    zoneId: "b99c3a7ad7a288aad56d6ab1d6b53614",
    enabled: true,
    previewsEnabled: false,
  },
  triggers: {
    crons: ["15 6,12,18 * * *"],
  },
  bindings: {
    d1: [
      {
        binding: "DB",
        databaseName: "dailydomain",
        databaseId: "4adefd4d-6651-43f3-8d1f-9c296c657d3b",
        migrationsDir: "migrations",
      },
    ],
    r2Buckets: [
      {
        binding: "ARCHIVE",
        bucketName: "dailydomain",
      },
    ],
    vars: {
      WHOISEXTRACTOR_PID: "10",
    },
    requiredSecrets: [
      "WHOISEXTRACTOR_API_KEY",
      "ACCESS_PASSWORD",
      "SESSION_SECRET",
    ],
  },
} as const;

export default cloudflareConfig;
