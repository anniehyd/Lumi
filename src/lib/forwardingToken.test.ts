import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), update: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ prisma: db }));

import {
  forwardingAddress,
  getOrCreateForwardingToken,
  inboundDomain,
  mintForwardingToken,
  parseAliasToken,
  resolveForwardingUser,
  resolveForwardingUserFromAddresses,
  rotateForwardingToken,
} from "@/lib/forwardingToken";

const HEX32 = /^[a-f0-9]{32}$/;
const TOKEN = "0123456789abcdef0123456789abcdef";

beforeEach(() => {
  vi.resetAllMocks();
  process.env.INBOUND_EMAIL_DOMAIN = "inbound.lumi.test";
});

describe("mintForwardingToken", () => {
  it("is 32 lowercase hex characters and differs every call", () => {
    const a = mintForwardingToken();
    const b = mintForwardingToken();
    expect(a).toMatch(HEX32);
    expect(b).toMatch(HEX32);
    expect(a).not.toBe(b);
  });
});

describe("inboundDomain", () => {
  it("normalises the configured domain and is null when unset", () => {
    process.env.INBOUND_EMAIL_DOMAIN = " @Inbound.Lumi.Test ";
    expect(inboundDomain()).toBe("inbound.lumi.test");
    process.env.INBOUND_EMAIL_DOMAIN = "";
    expect(inboundDomain()).toBeNull();
    delete process.env.INBOUND_EMAIL_DOMAIN;
    expect(inboundDomain()).toBeNull();
  });
});

describe("forwardingAddress / parseAliasToken", () => {
  it("round-trips", () => {
    const address = forwardingAddress(TOKEN, "inbound.lumi.test");
    expect(address).toBe(`lumi+${TOKEN}@inbound.lumi.test`);
    expect(parseAliasToken(address)).toBe(TOKEN);
  });

  it("accepts display-name and mixed-case forms", () => {
    expect(parseAliasToken(`Lumi <LUMI+${TOKEN.toUpperCase()}@Inbound.Lumi.Test>`)).toBe(TOKEN);
    expect(parseAliasToken(`  lumi+${TOKEN}@inbound.lumi.test  `)).toBe(TOKEN);
  });

  it("rejects other domains, other local parts and malformed tokens", () => {
    expect(parseAliasToken(`lumi+${TOKEN}@evil.test`)).toBeNull();
    expect(parseAliasToken(`sales+${TOKEN}@inbound.lumi.test`)).toBeNull();
    expect(parseAliasToken(`lumi@inbound.lumi.test`)).toBeNull();
    expect(parseAliasToken(`lumi+short@inbound.lumi.test`)).toBeNull();
    expect(parseAliasToken(`lumi+${TOKEN}x@inbound.lumi.test`)).toBeNull();
    expect(parseAliasToken("not an address")).toBeNull();
  });

  it("does not check the domain when none is configured", () => {
    expect(parseAliasToken(`lumi+${TOKEN}@whatever.test`, null)).toBe(TOKEN);
  });
});

describe("getOrCreateForwardingToken", () => {
  it("returns the stored token without writing", async () => {
    db.user.findUnique.mockResolvedValue({ forwardingToken: TOKEN });
    expect(await getOrCreateForwardingToken("u1")).toBe(TOKEN);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("mints and stores one when the user has none", async () => {
    db.user.findUnique.mockResolvedValue({ forwardingToken: null });
    db.user.update.mockResolvedValue({});
    const token = await getOrCreateForwardingToken("u1");
    expect(token).toMatch(HEX32);
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { forwardingToken: token } });
  });
});

describe("rotateForwardingToken", () => {
  it("always writes a fresh token", async () => {
    db.user.update.mockResolvedValue({});
    const token = await rotateForwardingToken("u1");
    expect(token).toMatch(HEX32);
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { forwardingToken: token } });
  });
});

describe("resolveForwardingUser", () => {
  it("maps a token to its owner by the unique column", async () => {
    db.user.findUnique.mockResolvedValue({ id: "u2" });
    expect(await resolveForwardingUser(TOKEN)).toBe("u2");
    expect(db.user.findUnique).toHaveBeenCalledWith({ where: { forwardingToken: TOKEN }, select: { id: true } });
  });

  it("does not hit the database for a token that cannot be one", async () => {
    expect(await resolveForwardingUser("nope")).toBeNull();
    expect(await resolveForwardingUser("")).toBeNull();
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it("returns null for an unknown token", async () => {
    db.user.findUnique.mockResolvedValue(null);
    expect(await resolveForwardingUser("f".repeat(32))).toBeNull();
  });
});

describe("resolveForwardingUserFromAddresses", () => {
  it("takes the first candidate that names a known user and skips the rest", async () => {
    const unknown = "e".repeat(32);
    db.user.findUnique.mockImplementation(async ({ where }: { where: { forwardingToken: string } }) =>
      where.forwardingToken === TOKEN ? { id: "owner" } : null
    );
    const result = await resolveForwardingUserFromAddresses([
      "student@nyu.edu",
      `lumi+${unknown}@inbound.lumi.test`,
      `Lumi <lumi+${TOKEN}@inbound.lumi.test>`,
      `lumi+${TOKEN}@inbound.lumi.test`,
    ]);
    expect(result).toEqual({ userId: "owner", token: TOKEN });
    // One lookup per distinct token, none for the plain address.
    expect(db.user.findUnique).toHaveBeenCalledTimes(2);
  });

  it("is null when nothing matches", async () => {
    db.user.findUnique.mockResolvedValue(null);
    expect(await resolveForwardingUserFromAddresses(["a@b.c", `lumi+${TOKEN}@inbound.lumi.test`])).toBeNull();
  });
});
