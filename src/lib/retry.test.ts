import { describe, expect, it, vi } from "vitest";
import { isRetryable, statusOf, withRetry } from "@/lib/retry";

const noSleep = () => Promise.resolve();
const quiet = () => vi.spyOn(console, "warn").mockImplementation(() => {});

describe("isRetryable", () => {
  it("retries rate limits, timeouts and server errors", () => {
    for (const status of [408, 429, 500, 502, 503, 504]) {
      expect(isRetryable({ status })).toBe(true);
    }
  });

  it("does not retry client errors — they will not fix themselves", () => {
    for (const status of [400, 401, 404, 409, 410, 422]) {
      expect(isRetryable({ status })).toBe(false);
    }
  });

  it("reads the status off a gaxios-shaped error", () => {
    expect(statusOf({ response: { status: 503 } })).toBe(503);
    expect(statusOf({ code: 429 })).toBe(429);
    expect(statusOf({ code: "429" })).toBe(429);
    expect(isRetryable({ response: { status: 503 } })).toBe(true);
  });

  it("retries a Google 403 only when it is a quota error", () => {
    expect(isRetryable({ code: 403, errors: [{ reason: "userRateLimitExceeded" }] })).toBe(true);
    expect(isRetryable({ code: 403, errors: [{ reason: "insufficientPermissions" }] })).toBe(false);
    expect(isRetryable({ code: 403 })).toBe(false);
  });

  it("retries dropped connections and fetch timeouts", () => {
    expect(isRetryable({ code: "ECONNRESET" })).toBe(true);
    expect(isRetryable({ name: "TimeoutError" })).toBe(true);
    const wrapped = Object.assign(new TypeError("fetch failed"), { cause: { code: "ETIMEDOUT" } });
    expect(isRetryable(wrapped)).toBe(true);
  });

  it("does not retry arbitrary errors or non-errors", () => {
    expect(isRetryable(new Error("boom"))).toBe(false);
    expect(isRetryable(null)).toBe(false);
    expect(isRetryable("nope")).toBe(false);
  });
});

describe("withRetry", () => {
  it("returns the first success without retrying", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    await expect(withRetry(fn, { sleep: noSleep })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries a transient failure and then succeeds", async () => {
    const warn = quiet();
    const fn = vi
      .fn()
      .mockRejectedValueOnce({ status: 503 })
      .mockRejectedValueOnce({ status: 429 })
      .mockResolvedValue("ok");
    await expect(withRetry(fn, { sleep: noSleep })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
    warn.mockRestore();
  });

  it("gives up after the attempt budget and rethrows the last error", async () => {
    const warn = quiet();
    const err = { status: 503 };
    const fn = vi.fn().mockRejectedValue(err);
    await expect(withRetry(fn, { attempts: 3, sleep: noSleep })).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(3);
    warn.mockRestore();
  });

  it("fails fast on a permanent error", async () => {
    const fn = vi.fn().mockRejectedValue({ status: 401 });
    await expect(withRetry(fn, { sleep: noSleep })).rejects.toEqual({ status: 401 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("waits at least as long as Retry-After asks", async () => {
    const warn = quiet();
    const delays: number[] = [];
    const fn = vi
      .fn()
      .mockRejectedValueOnce({ status: 429, response: { status: 429, headers: { "retry-after": "2" } } })
      .mockResolvedValue("ok");
    await withRetry(fn, { baseMs: 10, sleep: async (ms) => void delays.push(ms) });
    expect(delays[0]).toBeGreaterThanOrEqual(2000);
    warn.mockRestore();
  });

  it("caps every delay at maxMs", async () => {
    const warn = quiet();
    const delays: number[] = [];
    const fn = vi.fn().mockRejectedValue({ status: 500 });
    await withRetry(fn, { attempts: 6, baseMs: 100, maxMs: 300, sleep: async (ms) => void delays.push(ms) }).catch(
      () => {}
    );
    expect(delays).toHaveLength(5);
    expect(Math.max(...delays)).toBeLessThanOrEqual(300);
    warn.mockRestore();
  });
});
