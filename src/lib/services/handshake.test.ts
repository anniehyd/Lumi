import { describe, it, expect } from "vitest";
import { normalizeFeedUrl, HandshakeFeedError } from "@/lib/services/handshake";

// normalizeFeedUrl is the trust boundary: the feed URL is user input that
// drives a server-side fetch, so the allowlist is worth pinning down.
describe("normalizeFeedUrl", () => {
  it("upgrades the webcal:// scheme Handshake hands out", () => {
    expect(normalizeFeedUrl("webcal://nyu.joinhandshake.com/ical/abc123")).toBe(
      "https://nyu.joinhandshake.com/ical/abc123"
    );
  });

  it("accepts https Handshake URLs and the EU domain", () => {
    expect(normalizeFeedUrl("https://joinhandshake.com/ical/x")).toContain(
      "joinhandshake.com"
    );
    expect(normalizeFeedUrl("https://app.joinhandshake-eu.com/ical/x")).toContain(
      "joinhandshake-eu.com"
    );
  });

  it("trims surrounding whitespace from a paste", () => {
    expect(normalizeFeedUrl("  https://nyu.joinhandshake.com/ical/x \n")).toBe(
      "https://nyu.joinhandshake.com/ical/x"
    );
  });

  it.each([
    ["a non-Handshake host", "https://evil.example.com/ical/x"],
    ["a lookalike suffix", "https://joinhandshake.com.evil.example/ical/x"],
    ["plain http", "http://nyu.joinhandshake.com/ical/x"],
    ["a file URL", "file:///etc/passwd"],
    ["link-local metadata", "http://169.254.169.254/latest/meta-data/"],
    ["not a URL at all", "just some text"],
    ["an empty string", "   "],
  ])("rejects %s", (_label, input) => {
    expect(() => normalizeFeedUrl(input)).toThrow(HandshakeFeedError);
  });
});
