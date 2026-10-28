import test from "node:test";
import assert from "node:assert/strict";
import { safeNext } from "../lib/auth-redirect.js";
test("keeps a local return destination", () => assert.equal(safeNext("/parts/MIR-004?lang=ar"), "/parts/MIR-004?lang=ar"));
test("rejects external destinations and auth loops", () => {
  for (const value of [null, "https://example.com", "//example.com", "/\\example.com", "/login", "/auth/callback", "/\nexample.com"]) assert.equal(safeNext(value), "/");
});
