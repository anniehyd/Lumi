/**
 * Bounded retry with exponential backoff + jitter for the three upstreams Lumi
 * depends on (Gmail, Google Calendar, the extraction LLM).
 *
 * Only failures that can plausibly succeed on a second try are retried:
 * rate limits, 5xx, timeouts and dropped connections. A 400/401/404 is a bug
 * or a revoked grant — retrying it just burns quota and delays the real error.
 */

export type RetryOptions = {
  /** Total attempts including the first. Default 3. */
  attempts?: number;
  /** Delay before the first retry; doubles each time. Default 500ms. */
  baseMs?: number;
  /** Ceiling for any single delay. Default 8s. */
  maxMs?: number;
  /** Label for the warning line, e.g. "gmail.get". */
  label?: string;
  /** Override the default classification. */
  retryable?: (err: unknown) => boolean;
  /** Injected in tests so they don't actually wait. */
  sleep?: (ms: number) => Promise<void>;
};

const NETWORK_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EPIPE",
  "EAI_AGAIN",
  "ENOTFOUND",
  "ENETUNREACH",
  "UND_ERR_SOCKET",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
]);

// Google reports quota exhaustion as 403 with one of these reasons; a plain
// 403 (insufficient scope, access denied) is permanent.
const GOOGLE_RATE_REASONS = /rateLimitExceeded|userRateLimitExceeded|quotaExceeded|backendError/i;

type ErrorLike = {
  status?: unknown;
  code?: unknown;
  name?: unknown;
  message?: unknown;
  response?: { status?: unknown; headers?: unknown };
  headers?: unknown;
  errors?: { reason?: unknown }[];
  cause?: unknown;
};

/** HTTP status from the error shapes googleapis (gaxios), fetch wrappers and SDKs throw. */
export function statusOf(err: unknown): number | undefined {
  if (!err || typeof err !== "object") return undefined;
  const e = err as ErrorLike;
  for (const candidate of [e.status, e.response?.status, e.code]) {
    const n = typeof candidate === "string" ? Number(candidate) : candidate;
    if (typeof n === "number" && Number.isInteger(n) && n >= 100 && n <= 599) return n;
  }
  return undefined;
}

export function isRetryable(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as ErrorLike;

  const status = statusOf(err);
  if (status !== undefined) {
    if (status === 408 || status === 429 || status >= 500) return true;
    if (status === 403) {
      const reasons = (e.errors ?? []).map((x) => String(x?.reason ?? "")).join(" ");
      return GOOGLE_RATE_REASONS.test(`${reasons} ${String(e.message ?? "")}`);
    }
    return false;
  }

  if (typeof e.code === "string" && NETWORK_CODES.has(e.code)) return true;
  // AbortSignal.timeout() rejects with a TimeoutError DOMException.
  if (e.name === "TimeoutError" || e.name === "AbortError") return true;
  // undici wraps the socket error: TypeError("fetch failed", { cause }).
  if (e.name === "TypeError" && /fetch failed/i.test(String(e.message ?? ""))) return true;
  if (e.cause && e.cause !== err) return isRetryable(e.cause);
  return false;
}

/** Seconds from a Retry-After header, if the upstream sent one. */
function retryAfterMs(err: unknown): number | undefined {
  const e = err as ErrorLike;
  const headers = (e?.response?.headers ?? e?.headers) as
    | { get?: (k: string) => string | null }
    | Record<string, string | undefined>
    | undefined;
  if (!headers) return undefined;
  const raw =
    typeof (headers as { get?: unknown }).get === "function"
      ? (headers as { get: (k: string) => string | null }).get("retry-after")
      : (headers as Record<string, string | undefined>)["retry-after"];
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const attempts = Math.max(1, opts.attempts ?? 3);
  const baseMs = opts.baseMs ?? 500;
  const maxMs = opts.maxMs ?? 8_000;
  const retryable = opts.retryable ?? isRetryable;
  const sleep = opts.sleep ?? defaultSleep;

  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= attempts || !retryable(err)) throw err;
      // Full jitter on the exponential step, but never sooner than the
      // upstream asked for.
      const backoff = Math.min(maxMs, baseMs * 2 ** (attempt - 1));
      const delay = Math.min(maxMs, Math.max(retryAfterMs(err) ?? 0, backoff / 2 + Math.random() * (backoff / 2)));
      console.warn(
        `[retry] ${opts.label ?? "call"} failed (${statusOf(err) ?? (err as Error)?.name ?? "error"}); ` +
          `attempt ${attempt}/${attempts}, retrying in ${Math.round(delay)}ms`
      );
      await sleep(delay);
    }
  }
}
