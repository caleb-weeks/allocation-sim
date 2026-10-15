// Loaded with `node --import` before anything else so Sentry can instrument
// Express and http. A no-op when SENTRY_DSN isn't set (local dev, tests).
import * as Sentry from "@sentry/node";

try {
  process.loadEnvFile();
} catch {
  // Real environment only.
}

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? "development",
    release: process.env.SENTRY_RELEASE,
    tracesSampleRate: 0.1,
    // Sentry 11 collects bodies, cookies, and user info by default. Turn that
    // off: bodies carry curves and budgets, and cookies carry session tokens.
    dataCollection: { userInfo: false, cookies: false, httpBodies: [], httpHeaders: { request: { deny: ["cookie"] }, response: false } },
  });
}
