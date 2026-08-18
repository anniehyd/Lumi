import * as Sentry from "@sentry/node";

// Worker-process Sentry init. Must be imported before anything else in the
// worker entrypoint. Without SENTRY_DSN (demo, local dev) the SDK no-ops.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0,
  sendDefaultPii: false,
});

export { Sentry };
