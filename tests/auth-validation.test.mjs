import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { signInSchema, signUpSchema } from "../src/lib/auth/schemas.ts";

describe("Production Authentication Validation Schemas", () => {
  test("rejects invalid email formats", () => {
    const res = signInSchema.safeParse({ email: "invalid-email", password: "somepassword" });
    assert.equal(res.success, false);
    assert.match(res.error.issues[0].message, /valid email/);
  });

  test("rejects sign-up passwords shorter than 8 characters", () => {
    const res = signUpSchema.safeParse({
      email: "student@example.com",
      password: "short",
    });
    assert.equal(res.success, false);
    assert.match(res.error.issues[0].message, /at least 8 characters/);
  });

  test("rejects empty password on sign-in", () => {
    const res = signInSchema.safeParse({
      email: "student@example.com",
      password: "",
    });
    assert.equal(res.success, false);
    assert.match(res.error.issues[0].message, /Password is required/);
  });

  test("accepts valid sign-up details meeting NIST complexity guidelines", () => {
    const res = signUpSchema.safeParse({
      email: "student@example.com",
      password: "correcthorsebatterystaple",
      name: "Bihar Aspirant",
    });
    assert.equal(res.success, true);
    assert.equal(res.data.email, "student@example.com");
    assert.equal(res.data.name, "Bihar Aspirant");
  });
});
