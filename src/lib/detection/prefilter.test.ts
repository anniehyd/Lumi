import { describe, expect, it } from "vitest";
import {
  alreadyHandled,
  MAX_MODEL_CHARS,
  SENDER_MUTE_AFTER,
  SENDER_PROBE_EVERY,
  compactBody,
  contentHash,
  hasTemporalSignal,
  isBulk,
  isReplySubject,
  isSurveySubject,
  prefilter,
  restoreLink,
  senderAddress,
  shouldMuteSender,
  stripQuotedReply,
} from "@/lib/detection/prefilter";

describe("hasTemporalSignal", () => {
  it.each([
    "Join us Aug 17 in the lounge",
    "Doors open September 3rd",
    "on the 17th of August",
    "Deadline 10/14",
    "Starts 2026-10-14",
    "See you at 5pm",
    "Meet at 5:30 PM sharp",
    "Kickoff 17:00",
    "Lunch at noon",
    "Every Thursday this semester",
    "Reception tomorrow",
    "Happening tonight",
    "Workshop next week",
  ])("finds a time anchor in %j", (text) => {
    expect(hasTemporalSignal(text)).toBe(true);
  });

  it.each([
    "Refer a friend and you both get rewarded",
    "Your invite to build your reputation",
    "Join us in making the world better",
    "We posted a new update in your community",
  ])("finds none in %j", (text) => {
    expect(hasTemporalSignal(text)).toBe(false);
  });
});

describe("isSurveySubject", () => {
  it("catches survey and review requests", () => {
    for (const s of [
      "Got 5 minutes? Help us improve Counseling",
      "How would you rate your experience?",
      "Student life survey",
      "We'd love your feedback",
    ]) {
      expect(isSurveySubject(s)).toBe(true);
    }
  });

  it("leaves real invitations alone", () => {
    expect(isSurveySubject("You're invited: resume review workshop")).toBe(false);
    expect(isSurveySubject("Info session: Cloud Engineering")).toBe(false);
  });
});

describe("prefilter", () => {
  it("passes an invitation with a date", () => {
    expect(prefilter({ subject: "Fall mixer", bodyText: "Join us Oct 3 at 6pm." })).toEqual({ pass: true });
  });

  it("skips a survey before anything else", () => {
    expect(prefilter({ subject: "Quick survey", bodyText: "Closes Oct 3 at 6pm." })).toEqual({
      pass: false,
      reason: "survey",
    });
  });

  it("skips mail with nothing to put on a calendar", () => {
    expect(prefilter({ subject: "You're invited", bodyText: "Refer a friend and get rewarded." })).toEqual({
      pass: false,
      reason: "no_temporal",
    });
  });

  it("does not mistake digits inside a tracking URL for a date", () => {
    const body = "Refer a friend: https://example.com/c/8/17/2026-08-17/track?t=10:30";
    expect(prefilter({ subject: "You're invited", bodyText: body })).toEqual({
      pass: false,
      reason: "no_temporal",
    });
  });

  it("counts a date that appears only in the subject", () => {
    expect(prefilter({ subject: "Save the date: Sept 17", bodyText: "Details to follow." })).toEqual({
      pass: true,
    });
  });
});

describe("compactBody", () => {
  it("replaces URLs with numbered placeholders and keeps the table", () => {
    const c = compactBody("RSVP here: https://a.example/rsvp?x=1 or read https://b.example/more");
    expect(c.text).toBe("RSVP here: [L1] or read [L2]");
    expect(c.links).toEqual(["https://a.example/rsvp?x=1", "https://b.example/more"]);
    expect(c.truncated).toBe(false);
  });

  it("gives a repeated URL the same placeholder", () => {
    const c = compactBody("https://a.example/x and again https://a.example/x");
    expect(c.text).toBe("[L1] and again [L1]");
    expect(c.links).toHaveLength(1);
  });

  it("does not swallow sentence punctuation into the URL", () => {
    const c = compactBody("Register at https://a.example/go. See you there!");
    expect(c.text).toBe("Register at [L1]. See you there!");
    expect(c.links).toEqual(["https://a.example/go"]);
  });

  it("collapses whitespace and strips invisible padding", () => {
    const c = compactBody("Hello\u200b\u200c   world\n\n\n\n\nBye \u00a0 now");
    expect(c.text).toBe("Hello world\n\nBye now");
  });

  it("leaves URLs alone when link compaction is off", () => {
    const c = compactBody("Go to https://a.example/x", { links: false });
    expect(c.text).toBe("Go to https://a.example/x");
    expect(c.links).toEqual([]);
  });

  it("cuts at the ceiling and says so", () => {
    const c = compactBody("word ".repeat(MAX_MODEL_CHARS));
    expect(c.text.length).toBe(MAX_MODEL_CHARS);
    expect(c.truncated).toBe(true);
  });
});

describe("restoreLink", () => {
  const links = ["https://a.example/rsvp", "https://b.example/more"];

  it("resolves a placeholder, with or without brackets", () => {
    expect(restoreLink("[L2]", links)).toBe("https://b.example/more");
    expect(restoreLink("L1", links)).toBe("https://a.example/rsvp");
  });

  it("returns nothing for a placeholder that was never issued", () => {
    expect(restoreLink("[L9]", links)).toBeUndefined();
  });

  it("keeps a literal URL only if it was in the email", () => {
    expect(restoreLink("https://a.example/rsvp", links)).toBe("https://a.example/rsvp");
    expect(restoreLink("https://evil.example/made-up", links)).toBeUndefined();
  });

  it("drops non-URL text and empty values", () => {
    expect(restoreLink("see the email", links)).toBeUndefined();
    expect(restoreLink(undefined, links)).toBeUndefined();
    expect(restoreLink("", links)).toBeUndefined();
  });

  it("passes a URL through when compaction was off", () => {
    expect(restoreLink("https://a.example/rsvp", [])).toBe("https://a.example/rsvp");
  });
});

describe("contentHash", () => {
  it("is stable across tracking URLs, whitespace and case", () => {
    const a = contentHash("News <n@x.com>", "Hello", "Join us Friday\nhttps://t.example/abc123");
    const b = contentHash("n@x.com", " hello ", "join us   friday https://t.example/zzz999");
    expect(a).toBe(b);
  });

  it("differs when the content differs", () => {
    const a = contentHash("n@x.com", "Hello", "Join us Friday");
    expect(contentHash("n@x.com", "Hello", "Join us Saturday")).not.toBe(a);
    expect(contentHash("other@x.com", "Hello", "Join us Friday")).not.toBe(a);
  });
});

describe("senderAddress", () => {
  it("extracts and lowercases the address", () => {
    expect(senderAddress('"NYU Wasserman" <Career.Development@NYU.edu>')).toBe("career.development@nyu.edu");
    expect(senderAddress("plain@x.com")).toBe("plain@x.com");
  });
});

describe("isBulk", () => {
  it("recognises list mail by header or footer", () => {
    expect(isBulk("anything", true)).toBe(true);
    expect(isBulk("Click here to unsubscribe")).toBe(true);
    expect(isBulk("Manage your preferences")).toBe(true);
  });

  it("does not flag a personal note", () => {
    expect(isBulk("Hey Annie, coffee Thursday at 3?")).toBe(false);
  });
});

describe("stripQuotedReply", () => {
  it("keeps only what the sender wrote", () => {
    const body = [
      "Sounds good, thanks!",
      "",
      "On Mon, Aug 17, 2026 at 3:00 PM Sam <sam@x.com> wrote:",
      "> Join us for the info session on Friday at 5pm",
    ].join("\n");
    expect(stripQuotedReply(body)).toBe("Sounds good, thanks!");
  });

  it("handles Outlook-style separators", () => {
    const body = "See you there\n\n-----Original Message-----\nFrom: x\nRSVP by Friday";
    expect(stripQuotedReply(body)).toBe("See you there");
  });

  it("returns the whole body when nothing is quoted", () => {
    expect(stripQuotedReply("Dinner at 7 on Friday?")).toBe("Dinner at 7 on Friday?");
  });

  it("identifies reply subjects", () => {
    expect(isReplySubject("Re: Fall mixer")).toBe(true);
    expect(isReplySubject("RE : Fall mixer")).toBe(true);
    expect(isReplySubject("Fwd: Fall mixer")).toBe(false);
    expect(isReplySubject("Recruiting events")).toBe(false);
  });
});

describe("shouldMuteSender", () => {
  const history = (llmCalls: number, eventsFound: number, skippedSinceProbe = 0) => ({
    llmCalls,
    eventsFound,
    skippedSinceProbe,
  });

  it("never mutes an unknown sender", () => {
    expect(shouldMuteSender(null)).toBe(false);
  });

  it("gives a sender its first few tries", () => {
    expect(shouldMuteSender(history(SENDER_MUTE_AFTER - 1, 0))).toBe(false);
  });

  it("mutes a sender that keeps producing nothing", () => {
    expect(shouldMuteSender(history(SENDER_MUTE_AFTER, 0))).toBe(true);
  });

  it("never mutes a sender that has produced an event", () => {
    expect(shouldMuteSender(history(40, 1))).toBe(false);
  });

  it("lets every Nth email through as a probe", () => {
    expect(shouldMuteSender(history(3, 0, SENDER_PROBE_EVERY - 2))).toBe(true);
    expect(shouldMuteSender(history(3, 0, SENDER_PROBE_EVERY - 1))).toBe(false);
  });
});

describe("alreadyHandled", () => {
  it("stops Google Calendar's own invitation, update and cancellation mail", () => {
    expect(alreadyHandled({ from: "calendar-notification@google.com", subject: "Updated invitation: ISAW/Annie projects @ Mon 1pm (Zoom)" })).toBe("own_calendar");
    expect(alreadyHandled({ from: "Google Calendar <calendar-noreply@google.com>", subject: "Invitation: Weekly Eng Standup @ Mon Apr 20 10am" })).toBe("own_calendar");
    expect(alreadyHandled({ from: "brianna@nyu.edu", subject: "Canceled event: UXUI meeting Annie & Brianna @ Thu 3pm" })).toBe("own_calendar");
    expect(alreadyHandled({ from: "sophia@projectgarage.co", subject: "Accepted: Annie / Sophia Mock @ Sun Oct 19 11am" })).toBe("own_calendar");
  });

  it("stops reservation and booking confirmations", () => {
    expect(alreadyHandled({ from: "reservations@resy.com", subject: "Confirmed: Singapore Social, Saturday at 6:00 PM for 2" })).toBe("reservation");
    expect(alreadyHandled({ from: "La Boca <hello@sevenrooms.com>", subject: "Your reservation has been changed" })).toBe("reservation");
    expect(alreadyHandled({ from: "bobst@nyu.libcal.com", subject: "Study room booking confirmed: Bobst LL2-15" })).toBe("reservation");
  });

  it("lets real invitations through", () => {
    expect(alreadyHandled({ from: "qfs@nyu.edu", subject: "Optiver Info Session — Wednesday 7 PM" })).toBeNull();
    expect(alreadyHandled({ from: "invites@supermomos.com", subject: "Elaine invited you: Design and Research in the Age of AI" })).toBeNull();
    expect(alreadyHandled({ from: "hello@techatnyu.org", subject: "5 events in 6 days" })).toBeNull();
    expect(alreadyHandled({ from: "wasserman@nyu.edu", subject: "Reserve your spot: Marshall Wace coffee chats" })).toBeNull();
  });
});
