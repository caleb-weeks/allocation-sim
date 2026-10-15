import * as Sentry from "@sentry/nextjs";

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0.1,
    // Don't collect cookies or request bodies (curves, budgets, session tokens).
    dataCollection: { userInfo: false, cookies: false, httpBodies: [] },
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
