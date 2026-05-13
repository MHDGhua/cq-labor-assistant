import { beforeEach, describe, expect, it } from "vitest";
import { enforceRateLimit, getRateLimitKey, resetRateLimitStore } from "../lib/rate-limit";

const options = {
  scope: "test",
  limit: 2,
  windowMs: 1_000
} as const;

function request(headers: HeadersInit = {}) {
  return new Request("http://localhost/api/analyze", { headers });
}

beforeEach(() => {
  resetRateLimitStore();
});

describe("rate limit helper", () => {
  it("keys requests by client IP when proxy headers are present", () => {
    expect(getRateLimitKey(request({ "x-forwarded-for": "203.0.113.10, 10.0.0.1" }))).toBe(
      "ip:203.0.113.10"
    );
    expect(getRateLimitKey(request({ "x-real-ip": "203.0.113.11" }))).toBe("ip:203.0.113.11");
    expect(getRateLimitKey(request({ "cf-connecting-ip": "203.0.113.12" }))).toBe(
      "ip:203.0.113.12"
    );
  });

  it("falls back to a shared anonymous key when no client IP is available", () => {
    expect(getRateLimitKey(request({ "user-agent": "vitest" }))).toBe("fallback:anonymous");
    expect(getRateLimitKey(request())).toBe("fallback:anonymous");
  });

  it("blocks requests after the configured window quota is exhausted", () => {
    const req = request({ "x-forwarded-for": "203.0.113.20" });

    expect(enforceRateLimit(req, options, 10_000)).toMatchObject({ allowed: true, remaining: 1 });
    expect(enforceRateLimit(req, options, 10_100)).toMatchObject({ allowed: true, remaining: 0 });

    const blocked = enforceRateLimit(req, options, 10_200);
    expect(blocked).toMatchObject({
      allowed: false,
      limit: 2,
      remaining: 0,
      resetAt: 11_000,
      retryAfterSeconds: 1
    });
  });

  it("resets the bucket after the configured window", () => {
    const req = request({ "x-forwarded-for": "203.0.113.30" });

    expect(enforceRateLimit(req, options, 20_000).allowed).toBe(true);
    expect(enforceRateLimit(req, options, 20_500).allowed).toBe(true);
    expect(enforceRateLimit(req, options, 21_000)).toMatchObject({
      allowed: true,
      remaining: 1,
      resetAt: 22_000
    });
  });

  it("keeps independent buckets for route scopes and clients", () => {
    const clientA = request({ "x-forwarded-for": "203.0.113.40" });
    const clientB = request({ "x-forwarded-for": "203.0.113.41" });

    enforceRateLimit(clientA, options, 30_000);
    enforceRateLimit(clientA, options, 30_100);

    expect(enforceRateLimit(clientA, options, 30_200).allowed).toBe(false);
    expect(enforceRateLimit(clientB, options, 30_200).allowed).toBe(true);
    expect(enforceRateLimit(clientA, { ...options, scope: "other" }, 30_200).allowed).toBe(true);
  });
});
