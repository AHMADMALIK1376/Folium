import { test } from "node:test";
import assert from "node:assert/strict";
import { canAccessDocument } from "../src/lib/repo.ts";

test("owner always has access", () => {
  const doc = { owner_id: "user_alice" };
  assert.equal(canAccessDocument(doc, "user_alice", []), true);
});

test("a user who has been shared the document has access", () => {
  const doc = { owner_id: "user_alice" };
  assert.equal(canAccessDocument(doc, "user_bob", ["user_bob", "user_carol"]), true);
});

test("a user not in the owner or share list is denied", () => {
  const doc = { owner_id: "user_alice" };
  assert.equal(canAccessDocument(doc, "user_dave", ["user_bob"]), false);
});

test("an empty/missing user id is always denied, even against an empty owner check", () => {
  const doc = { owner_id: "" };
  assert.equal(canAccessDocument(doc, "", []), false);
});
