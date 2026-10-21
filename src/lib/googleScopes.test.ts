import { describe, expect, it } from "vitest";
import {
  CALENDAR_SCOPE,
  CONNECT_SCOPES,
  GMAIL_SCOPE,
  SIGN_IN_SCOPES,
  grantsFromScope,
  mergeScopes,
} from "./googleScopes";

describe("google scopes", () => {
  it("sign-in asks for nothing sensitive", () => {
    expect(SIGN_IN_SCOPES.split(" ")).toEqual(["openid", "email", "profile"]);
    expect(SIGN_IN_SCOPES).not.toContain("googleapis.com");
  });

  it("connect adds Gmail and Calendar on top of sign-in", () => {
    expect(CONNECT_SCOPES).toContain(SIGN_IN_SCOPES);
    expect(grantsFromScope(CONNECT_SCOPES)).toEqual({ gmail: true, calendar: true });
  });

  it("reads grants out of a stored scope string", () => {
    expect(grantsFromScope(null)).toEqual({ gmail: false, calendar: false });
    expect(grantsFromScope("openid email profile")).toEqual({ gmail: false, calendar: false });
    expect(grantsFromScope(`openid  ${CALENDAR_SCOPE}`)).toEqual({ gmail: false, calendar: true });
    expect(grantsFromScope(`${GMAIL_SCOPE} openid`)).toEqual({ gmail: true, calendar: false });
  });

  it("merging never drops a grant and never repeats one", () => {
    const merged = mergeScopes(CONNECT_SCOPES, SIGN_IN_SCOPES);
    expect(grantsFromScope(merged)).toEqual({ gmail: true, calendar: true });
    expect(merged.split(" ").length).toBe(5);
    expect(mergeScopes(null, "openid")).toBe("openid");
    expect(mergeScopes("", "")).toBe("");
  });
});
