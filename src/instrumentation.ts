import * as Sentry from "@sentry/nextjs";

// Server-side error monitoring only. No DSN (demo mode, local dev) → SDK is
// a no-op. Browser reporting is intentionally not wired up: the worker and
// API routes are where silent failures live, and keeping Sentry server-side
// keeps inbox-derived content out of third-party payloads.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      tracesSampleRate: 0,
      sendDefaultPii: false,
      beforeSend(event) {
        if (event.request) {
          delete event.request.cookies;
          delete event.request.headers;
          delete event.request.data;
        }
        return event;
      },
    });
  }
}

export const onRequestError = Sentry.captureRequestError;
