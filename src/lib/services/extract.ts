import Anthropic from "@anthropic-ai/sdk";
import type { ExtractedEvent } from "@/lib/detection/types";
import { costUsd, logUsage, type Usage } from "@/lib/services/llm-cost";
import { rubricFor, DEFAULT_PROFILE, PROMPT_VERSION, type UserProfile } from "@/lib/profile";
import { compactBody, restoreLink } from "@/lib/detection/prefilter";
import { withRetry } from "@/lib/retry";

/**
 * Structured event extraction via forced tool use — the model must call
 * `save_events` with a typed payload, giving us JSON out with zero prompt
 * parsing.
 *
 * Two providers behind one contract:
 *   - anthropic  → Claude via @anthropic-ai/sdk
 *   - qwen       → Qwen via any OpenAI-compatible endpoint (Alibaba Model
 *                  Studio, Together, Fireworks, OpenRouter, vLLM, Ollama)
 *
 * The prompt and the JSON schema are shared, so the only thing that varies
 * between providers is the wire format. Switch with LLM_MODEL alone; set
 * LLM_PROVIDER only to override the inference.
 *
 * Extracts MULTIPLE events from a single email (newsletters often bundle
 * several). If no events are found, returns [].
 */

type Provider = "anthropic" | "qwen";

/**
 * Resolved per call, not at module load, so a model switch takes effect on the
 * next sweep without a restart — and so the A/B harness can drive both
 * providers in one process.
 */
function config(): { model: string; provider: Provider } {
  // `||` not `??`: an empty LLM_MODEL= line in .env means "unset".
  const model = process.env.LLM_MODEL || process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
  const provider =
    (process.env.LLM_PROVIDER?.toLowerCase() as Provider) ||
    (model.startsWith("claude") ? "anthropic" : "qwen");
  return { model, provider };
}

/**
 * What production ran before the shutdown (commit 14e647a) and what
 * .env.example has always suggested. The old in-code fallback was Sonnet 4.6,
 * 3× the price, and only applied when the env var was forgotten.
 */
export const DEFAULT_MODEL = "claude-haiku-4-5";

// A digest can carry a dozen events at ~150 output tokens each; 2000 cut the
// tool call off mid-JSON on the longest ones, which loses the whole email.
const MAX_TOKENS = 4096;
const REQUEST_TIMEOUT_MS = 60_000;

/**
 * Replace URLs with [Ln] placeholders before the model sees the email.
 * On by default; set LLM_COMPACT_LINKS=false to send bodies verbatim.
 */
function compactLinks(): boolean {
  return process.env.LLM_COMPACT_LINKS !== "false";
}

/** Stamped on Event.promptVersion so a prompt change is visible in the metrics. */
export function activePromptVersion(): string {
  return compactLinks() ? `${PROMPT_VERSION}+links` : PROMPT_VERSION;
}
const TOOL_NAME = "save_events";
const TOOL_DESCRIPTION =
  "Save the events found in this email. If the email contains no events, pass an empty array. Extract every distinct event — newsletters often bundle several.";

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (client) return client;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  // The SDK retries 408/409/429/5xx and connection errors itself, with
  // backoff; one more than its default of 2 because a sweep is unattended.
  client = new Anthropic({ apiKey: key, maxRetries: 3, timeout: REQUEST_TIMEOUT_MS });
  return client;
}

const TOOL_SCHEMA = {
  type: "object" as const,
  properties: {
    events: {
      type: "array" as const,
      description: "Every distinct event found in this email.",
      items: {
        type: "object" as const,
        properties: {
          title: { type: "string" as const, description: "Short event title." },
          description: {
            type: "string" as const,
            description: "1-2 sentence summary of the event.",
          },
          startTime: {
            type: "string" as const,
            description: "ISO 8601 start time with timezone, e.g. 2026-04-28T12:00:00-04:00.",
          },
          endTime: {
            type: "string" as const,
            description: "ISO 8601 end time. Omit if not specified.",
          },
          timezone: {
            type: "string" as const,
            description: "IANA timezone, e.g. America/New_York.",
          },
          locationName: { type: "string" as const },
          locationAddress: { type: "string" as const },
          organizerName: { type: "string" as const },
          organizerCompany: { type: "string" as const },
          rsvpLink: { type: "string" as const },
          rsvpDeadline: { type: "string" as const, description: "ISO 8601 if mentioned." },
          attire: { type: "string" as const },
          confidence: {
            type: "number" as const,
            description: "Your confidence this is a real event, 0..1.",
          },
          kind: {
            type: "string" as const,
            enum: ["MEETING", "INFO_SESSION", "DEADLINE", "COFFEE_CHAT"],
          },
          relevance: {
            type: "integer" as const,
            description:
              "How relevant this event is to the user's interests, 1 (barely) to 5 (perfect fit). Follow the relevance rubric in the system prompt.",
          },
        },
        required: ["title", "startTime", "timezone", "confidence", "kind", "description", "relevance"],
      },
    },
  },
  required: ["events"],
};

export const SAVE_EVENTS_TOOL = {
  name: TOOL_NAME,
  description: TOOL_DESCRIPTION,
  input_schema: TOOL_SCHEMA,
};

/**
 * Shared half of the prompt — the extraction rules, identical for everyone.
 * The per-user relevance rubric is appended from their profile.
 */
const EXTRACTION_RULES = `You extract event invitations from emails.

Rules:
- Extract EVERY event in the email — newsletters and digests often contain multiple.
- Only real event invitations count: things the recipient is invited to attend
  (info sessions, talks, workshops, socials, career events, meetings).
- An application or RSVP deadline is an event. Set kind=DEADLINE, use the deadline as startTime.
- Surveys and feedback requests are NOT events — skip survey/feedback deadlines entirely.
- Marketing or promotional emails from businesses (fitness studios, gyms, retail,
  class schedules, member perks) are ads — extract NOTHING from them, even if
  they list specific class or session times.
- Job postings, general announcements without a time, and unsubscribe footers are NOT events.
- If no events, return an empty array.
- Always infer a timezone. Default to the sender's likely timezone (e.g. US universities → America/New_York).
- Confidence: 1.0 = explicit date + location + RSVP; 0.8 = date + title; <0.7 = ambiguous.`;

const LINK_RULE = `- Links in the email are shown as placeholders like [L1], [L2]. When an event
  has an RSVP or registration link, return its placeholder exactly as written
  (for example "[L3]"). Never invent a URL.`;

function systemPromptFor(profile: UserProfile, year: number): string {
  // The year comes from the email's own date, not the wall clock or a
  // literal, so a January sweep of December mail still resolves correctly.
  const yearRule = `- Use the year the email was received (${year}) when the email omits it; if that date would already be in the past relative to the email, use the next year.`;
  const rules = [EXTRACTION_RULES, yearRule, ...(compactLinks() ? [LINK_RULE] : [])].join("\n");
  return `${rules}\n\n${rubricFor(profile)}`;
}

/** What a provider hands back: the raw tool payload plus token counts. */
type Call = { payload: unknown; usage: Usage } | null;

async function callAnthropic(model: string, system: string, userContent: string): Promise<Call> {
  const anthropic = getClient();
  if (!anthropic) return null;

  const response = await anthropic.messages.create({
    model,
    max_tokens: MAX_TOKENS,
    system,
    tools: [SAVE_EVENTS_TOOL],
    tool_choice: { type: "tool", name: TOOL_NAME },
    messages: [{ role: "user", content: userContent }],
  });

  if (response.stop_reason === "max_tokens") {
    // The tool input was cut off, so whatever parsed is incomplete.
    console.warn(`[extract] ${model} hit max_tokens (${MAX_TOKENS}); events from this email may be missing`);
  }

  const toolUse = response.content.find((c) => c.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") return null;

  return {
    payload: (toolUse.input as { events?: unknown }).events ?? [],
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
  };
}

/**
 * Qwen (and anything else speaking OpenAI chat-completions).
 *
 * Written against `fetch` rather than the `openai` SDK: it is one endpoint,
 * it keeps the Fly image free of another dependency, and every OpenAI-compatible
 * host accepts this exact shape.
 *
 * Forced tool choice is the one real incompatibility — several Qwen models
 * restrict or reject `tool_choice: {type: "function"}`, so a 400 that mentions
 * tool_choice is retried once with `auto`.
 */
async function callQwen(model: string, system: string, userContent: string): Promise<Call> {
  const key = process.env.LLM_API_KEY;
  if (!key) return null;

  const base =
    process.env.LLM_BASE_URL ?? "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";

  const body = (forced: boolean) => ({
    model,
    max_tokens: MAX_TOKENS,
    messages: [
      { role: "system", content: system },
      { role: "user", content: userContent },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: TOOL_NAME,
          description: TOOL_DESCRIPTION,
          parameters: TOOL_SCHEMA,
        },
      },
    ],
    tool_choice: forced ? { type: "function", function: { name: TOOL_NAME } } : "auto",
  });

  // Rate limits, 5xx and dropped connections are retried; a 400 is returned
  // to the caller below, which knows how to react to the tool_choice one.
  async function post(forced: boolean): Promise<Response> {
    return withRetry(
      async () => {
        const res = await fetch(`${base}/chat/completions`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${key}`,
          },
          body: JSON.stringify(body(forced)),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (res.status === 429 || res.status >= 500) {
          throw Object.assign(new Error(`${model} extraction failed (${res.status})`), {
            status: res.status,
            headers: res.headers,
          });
        }
        return res;
      },
      { label: `llm.${model}` }
    );
  }

  let res = await post(true);
  if (res.status === 400) {
    const text = await res.text();
    if (!/tool_choice/i.test(text)) {
      throw new Error(`${model} extraction failed (400): ${text.slice(0, 300)}`);
    }
    // This model does not accept a forced function call — let it choose.
    res = await post(false);
  }
  if (!res.ok) {
    throw new Error(
      `${model} extraction failed (${res.status}): ${(await res.text()).slice(0, 300)}`
    );
  }

  const json = (await res.json()) as {
    choices?: { message?: { tool_calls?: { function?: { arguments?: string } }[] } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  const usage: Usage = {
    inputTokens: json.usage?.prompt_tokens ?? 0,
    outputTokens: json.usage?.completion_tokens ?? 0,
  };

  // With tool_choice: auto the model may answer in prose instead of calling
  // the tool. That means "no events" for our purposes — same as Claude
  // returning an empty array.
  const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) return { payload: [], usage };

  let parsed: unknown;
  try {
    parsed = JSON.parse(args);
  } catch {
    return { payload: [], usage };
  }

  return { payload: (parsed as { events?: unknown })?.events ?? [], usage };
}

/**
 * A provider chosen explicitly via LLM_MODEL must have its key, or we fail
 * loudly here.
 *
 * Without this the misconfiguration is invisible: callQwen/getClient return
 * null for a missing key, extractEvents turns that into [], and an unconfigured
 * provider is indistinguishable from "this email had no events". Lumi keeps
 * sweeping, logs nothing, and silently stops finding anything.
 *
 * Only an *explicit* LLM_MODEL trips this. Leaving every key unset stays a
 * quiet no-op, because that is the demo deployment's normal state.
 */
function assertConfigured(model: string, provider: Provider): void {
  if (!process.env.LLM_MODEL) return;
  const envVar = provider === "qwen" ? "LLM_API_KEY" : "ANTHROPIC_API_KEY";
  if (!process.env[envVar]) {
    throw new Error(
      `LLM_MODEL=${model} selects the ${provider} provider, but ${envVar} is empty. ` +
        `Set ${envVar}, or unset LLM_MODEL to fall back to ANTHROPIC_MODEL.`
    );
  }
}

export type ExtractionInput = {
  subject: string;
  from: string;
  bodyText: string;
  receivedAt: Date;
  /** Omitted only by scripts; production always passes the user's profile. */
  profile?: UserProfile;
};

export type ExtractionResult = {
  events: ExtractedEvent[];
  /** False when no provider is configured (demo mode) — no call was made. */
  called: boolean;
  usage: Usage;
  /** Null when the model has no price on file. */
  usd: number | null;
};

const CONFIDENCE_FALLBACK = 0.7;
const RELEVANCE_FALLBACK = 3;

/** Relevance is a 1–5 star rating; anything else the model returns is pulled into range. */
export function clampRelevance(value: unknown): number {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) return RELEVANCE_FALLBACK;
  return Math.min(5, Math.max(1, Math.round(n)));
}

function clampConfidence(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return CONFIDENCE_FALLBACK;
  return Math.min(1, Math.max(0, value));
}

const KINDS: ExtractedEvent["kind"][] = ["MEETING", "INFO_SESSION", "DEADLINE", "COFFEE_CHAT"];

/**
 * Turn the raw tool payload into trusted events: tolerate the shapes models
 * actually return, drop anything without a title and a parseable start, pull
 * scores into range, and resolve link placeholders.
 */
export function normalizeEvents(payload: unknown, links: string[] = []): ExtractedEvent[] {
  // The model occasionally returns the events array JSON-encoded as a string.
  let raw = payload;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = [];
    }
  }
  const events = (Array.isArray(raw) ? raw : []) as Partial<ExtractedEvent>[];

  return events.filter(isValid).map((e) => ({
    title: e.title.trim(),
    description: typeof e.description === "string" ? e.description : "",
    startTime: e.startTime,
    endTime: isDateString(e.endTime) ? e.endTime : undefined,
    timezone: typeof e.timezone === "string" && e.timezone ? e.timezone : "America/New_York",
    locationName: e.locationName,
    locationAddress: e.locationAddress,
    organizerName: e.organizerName,
    organizerCompany: e.organizerCompany,
    rsvpLink: restoreLink(e.rsvpLink, links),
    rsvpDeadline: isDateString(e.rsvpDeadline) ? e.rsvpDeadline : undefined,
    attire: e.attire,
    confidence: clampConfidence(e.confidence),
    kind: KINDS.includes(e.kind as ExtractedEvent["kind"]) ? (e.kind as ExtractedEvent["kind"]) : "MEETING",
    relevance: clampRelevance(e.relevance),
  }));
}

/** Extraction plus what it cost — the pipeline uses this to feed the metrics. */
export async function extractEventsDetailed(input: ExtractionInput): Promise<ExtractionResult> {
  const compact = compactBody(input.bodyText, { links: compactLinks() });
  if (compact.truncated) {
    console.warn(`[extract] body over the size ceiling, truncated: "${input.subject.slice(0, 60)}"`);
  }
  const userContent = `From: ${input.from}
Subject: ${input.subject}
Received: ${input.receivedAt.toISOString()}

---

${compact.text}`;

  const { model, provider } = config();
  assertConfigured(model, provider);
  const system = systemPromptFor(input.profile ?? DEFAULT_PROFILE, input.receivedAt.getUTCFullYear());
  const started = Date.now();
  const call =
    provider === "qwen"
      ? await callQwen(model, system, userContent)
      : await callAnthropic(model, system, userContent);
  if (!call) return { events: [], called: false, usage: { inputTokens: 0, outputTokens: 0 }, usd: null };

  const events = normalizeEvents(call.payload, compact.links);

  logUsage({
    provider,
    model,
    usage: call.usage,
    events: events.length,
    ms: Date.now() - started,
    promptVersion: activePromptVersion(),
  });

  return { events, called: true, usage: call.usage, usd: costUsd(model, call.usage) };
}

export async function extractEvents(input: ExtractionInput): Promise<ExtractedEvent[]> {
  return (await extractEventsDetailed(input)).events;
}

/** @deprecated Use `extractEvents` — the extractor is no longer Claude-specific. */
export const extractWithClaude = extractEvents;

function isDateString(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isValid(e: Partial<ExtractedEvent>): e is ExtractedEvent {
  return typeof e?.title === "string" && e.title.trim().length > 0 && isDateString(e.startTime);
}

/** The model id this process would use right now — for stamping attribution. */
export function activeModel(): string {
  return config().model;
}
