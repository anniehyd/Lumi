import { vi } from "vitest";

/**
 * Hard guarantee that the suite cannot touch anything real, whatever a test
 * forgets to mock and whatever is in the developer's .env:
 *   - the database URL points at a closed local port
 *   - provider keys and Google credentials are blanked
 *   - any un-mocked fetch() throws instead of reaching the network
 */
process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/lumi_test";
process.env.REDIS_URL = "redis://127.0.0.1:1";
process.env.LUMI_NO_USAGE_PERSIST = "1";
for (const key of [
  "ANTHROPIC_API_KEY",
  "LLM_API_KEY",
  "LLM_MODEL",
  "LLM_PROVIDER",
  "LLM_BASE_URL",
  "ANTHROPIC_MODEL",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "HANDSHAKE_ICS_URL",
  "SENTRY_DSN",
  "CRON_SECRET",
]) {
  delete process.env[key];
}

vi.stubGlobal("fetch", (input: unknown) => {
  throw new Error(`Unmocked network call in a test: ${String(input)}`);
});
