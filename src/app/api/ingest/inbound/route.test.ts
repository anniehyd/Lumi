import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ user: { findUnique: vi.fn() } }));
const ingest = vi.hoisted(() => ({ ingestInbound: vi.fn() }));

vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/lib/services/ingest", () => ingest);

import { POST } from "@/app/api/ingest/inbound/route";

const fixture = (name: string) =>
  readFileSync(fileURLToPath(new URL(`../../../../lib/services/testdata/${name}`, import.meta.url)), "utf8");
const POSTMARK = JSON.parse(fixture("postmark-inbound.json"));
const NEWSLETTER = fixture("forwarded-newsletter.eml");
const CONFIRMATION = fixture("gmail-forwarding-confirmation.eml");
const TOKEN = "0123456789abcdef0123456789abcdef";

function post(body: unknown, init: { secret?: string | null; query?: string } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (init.secret) headers.authorization = `Basic ${Buffer.from(`lumi:${init.secret}`).toString("base64")}`;
  return new Request(`https://lumi.test/api/ingest/inbound${init.query ?? ""}`, {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  process.env.INBOUND_WEBHOOK_SECRET = "s3cret";
  process.env.INBOUND_EMAIL_DOMAIN = "inbound.lumi.test";
  db.user.findUnique.mockImplementation(async ({ where }: { where: { forwardingToken: string } }) =>
    where.forwardingToken === TOKEN ? { id: "owner" } : null
  );
  ingest.ingestInbound.mockResolvedValue({ stored: true, emailId: "e1", skipped: null, eventsCreated: 1, failed: false });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/ingest/inbound", () => {
  it("is off until a secret is configured", async () => {
    delete process.env.INBOUND_WEBHOOK_SECRET;
    const res = await POST(post(POSTMARK, { secret: "s3cret" }));
    expect(res.status).toBe(503);
    expect(ingest.ingestInbound).not.toHaveBeenCalled();
  });

  it("rejects a missing or wrong secret", async () => {
    expect((await POST(post(POSTMARK))).status).toBe(401);
    expect((await POST(post(POSTMARK, { secret: "wrong" }))).status).toBe(401);
    expect((await POST(post(POSTMARK, { query: "?token=wrong" }))).status).toBe(401);
    expect(ingest.ingestInbound).not.toHaveBeenCalled();
  });

  it("rejects a body that is not JSON", async () => {
    const res = await POST(post("not json", { secret: "s3cret" }));
    expect(res.status).toBe(400);
  });

  it("resolves the user from the alias and ingests the raw message", async () => {
    const res = await POST(post({ ...POSTMARK, RawEmail: NEWSLETTER }, { secret: "s3cret" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, emailId: "e1", eventsCreated: 1, skipped: null, failed: false });
    expect(ingest.ingestInbound).toHaveBeenCalledTimes(1);
    const [userId, parsed] = ingest.ingestInbound.mock.calls[0];
    expect(userId).toBe("owner");
    expect(parsed).toMatchObject({
      messageId: "newsletter-2099-09-15@lists.nyu.edu",
      from: '"NYU Tandon Career Services" <careers@nyu.edu>',
      subject: "Fall Tech Fair, Sept 24 at 1pm",
    });
  });

  it("accepts the secret as a query token too", async () => {
    const res = await POST(post(POSTMARK, { query: "?token=s3cret" }));
    expect(res.status).toBe(200);
    expect(ingest.ingestInbound).toHaveBeenCalledTimes(1);
  });

  it("finds the alias in the raw headers when the envelope recipient is missing", async () => {
    const payload = { ...POSTMARK, OriginalRecipient: undefined, ToFull: [], To: "", Headers: [], RawEmail: NEWSLETTER };
    const res = await POST(post(payload, { secret: "s3cret" }));
    expect(res.status).toBe(200);
    expect(ingest.ingestInbound.mock.calls[0][0]).toBe("owner");
  });

  it("acknowledges mail for an unknown or foreign-domain alias without ingesting it", async () => {
    const unknown = { ...POSTMARK, OriginalRecipient: `lumi+${"f".repeat(32)}@inbound.lumi.test`, Headers: [] };
    let res = await POST(post(unknown, { secret: "s3cret" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, skipped: "unknown-recipient" });

    const foreign = { ...POSTMARK, OriginalRecipient: `lumi+${TOKEN}@evil.test`, Headers: [] };
    res = await POST(post(foreign, { secret: "s3cret" }));
    expect(await res.json()).toEqual({ ok: true, skipped: "unknown-recipient" });
    expect(ingest.ingestInbound).not.toHaveBeenCalled();
  });

  it("reports a redelivery as a duplicate with 200 so the provider stops retrying", async () => {
    ingest.ingestInbound.mockResolvedValue({ stored: false, emailId: null, skipped: null, eventsCreated: 0, failed: false });
    const res = await POST(post(POSTMARK, { secret: "s3cret" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, skipped: "duplicate" });
  });

  it("stores Gmail's forwarding confirmation without running detection", async () => {
    const res = await POST(post({ ...POSTMARK, RawEmail: CONFIRMATION, Subject: "", Headers: [] }, { secret: "s3cret" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, forwardingConfirmation: true });
    expect(ingest.ingestInbound).toHaveBeenCalledWith("owner", expect.objectContaining({ subject: expect.stringContaining("Gmail Forwarding Confirmation") }), {
      detect: false,
      skipReason: "forwarding_confirmation",
    });
  });

  it("unwraps a hand-forwarded message before ingesting it", async () => {
    const payload = {
      ...POSTMARK,
      Subject: "Fwd: Fall Tech Fair",
      TextBody:
        "---------- Forwarded message ---------\nFrom: NYU Careers <careers@nyu.edu>\nDate: Tue, Sep 15, 2099\nSubject: Fall Tech Fair, Sept 24 at 1pm\nTo: <student@nyu.edu>\n\nJoin us.",
      From: "student@nyu.edu",
      FromFull: { Email: "student@nyu.edu", Name: "Student" },
    };
    await POST(post(payload, { secret: "s3cret" }));
    expect(ingest.ingestInbound.mock.calls[0][1]).toMatchObject({
      from: "NYU Careers <careers@nyu.edu>",
      subject: "Fall Tech Fair, Sept 24 at 1pm",
      bodyText: "Join us.",
    });
  });
});
