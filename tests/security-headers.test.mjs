import { test, describe } from "node:test";
import assert from "node:assert/strict";
import nextConfig from "../next.config.ts";

describe("Security Headers Configuration", () => {
  test("defines strict security headers for all routes", async () => {
    assert.ok(typeof nextConfig.headers === "function", "headers should be a function");
    const headerConfigs = await nextConfig.headers();
    assert.ok(Array.isArray(headerConfigs), "headers should return an array");

    const allRoutesConfig = headerConfigs.find((c) => c.source === "/(.*)");
    assert.ok(allRoutesConfig, "should configure headers for /(.*)");

    const headersMap = Object.fromEntries(
      allRoutesConfig.headers.map((h) => [h.key, h.value])
    );

    assert.equal(headersMap["X-Frame-Options"], "DENY");
    assert.equal(headersMap["X-Content-Type-Options"], "nosniff");
    assert.equal(headersMap["Referrer-Policy"], "strict-origin-when-cross-origin");
    assert.ok(headersMap["Permissions-Policy"].includes("camera=()"));

    // Ensure CSP allows Supabase connections
    const csp = headersMap["Content-Security-Policy"];
    assert.ok(csp, "CSP header must be defined");
    assert.ok(
      csp.includes("connect-src 'self' https://*.supabase.co"),
      "CSP must allow connect-src to *.supabase.co to prevent breaking Supabase client"
    );
    assert.ok(
      csp.includes("frame-ancestors 'none'"),
      "CSP must include frame-ancestors 'none'"
    );
  });
});
