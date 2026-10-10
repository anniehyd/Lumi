import { describe, it, expect, afterEach } from "vitest";
import { extractEvents } from "@/lib/services/extract";

const input = {
  subject: "Test",
  from: "a@b.com",
  bodyText: "body",
  receivedAt: new Date("2026-09-14T12:00:00Z"),
};

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

// A provider selected by LLM_MODEL but missing its key used to return [],
// which is indistinguishable from "no events in this email" — production
// would stop extracting silently. It must throw instead.
describe("extractEvents provider configuration", () => {
  it("throws when LLM_MODEL selects qwen but LLM_API_KEY is empty", async () => {
    process.env.LLM_MODEL = "qwen-flash";
    process.env.LLM_API_KEY = "";
    await expect(extractEvents(input)).rejects.toThrow(/LLM_API_KEY is empty/);
  });

  it("throws when LLM_MODEL selects claude but ANTHROPIC_API_KEY is empty", async () => {
    process.env.LLM_MODEL = "claude-haiku-4-5";
    process.env.ANTHROPIC_API_KEY = "";
    await expect(extractEvents(input)).rejects.toThrow(/ANTHROPIC_API_KEY is empty/);
  });

  it("stays a quiet no-op when no LLM_MODEL is set (demo deployment)", async () => {
    delete process.env.LLM_MODEL;
    delete process.env.ANTHROPIC_MODEL;
    delete process.env.ANTHROPIC_API_KEY;
    await expect(extractEvents(input)).resolves.toEqual([]);
  });
});
