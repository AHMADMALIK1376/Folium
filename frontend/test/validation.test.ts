import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createDocumentSchema,
  updateDocumentSchema,
  shareDocumentSchema,
} from "../src/lib/validation.ts";

test("createDocumentSchema accepts a missing title (defaults happen server-side)", () => {
  const result = createDocumentSchema.safeParse({});
  assert.equal(result.success, true);
});

test("createDocumentSchema rejects a blank title when provided", () => {
  const result = createDocumentSchema.safeParse({ title: "   " });
  assert.equal(result.success, false);
});

test("updateDocumentSchema requires at least a title or content field", () => {
  const result = updateDocumentSchema.safeParse({});
  assert.equal(result.success, false);
});

test("updateDocumentSchema accepts a content-only update", () => {
  const result = updateDocumentSchema.safeParse({ content: "<p>hi</p>" });
  assert.equal(result.success, true);
});

test("shareDocumentSchema rejects malformed emails", () => {
  const result = shareDocumentSchema.safeParse({ email: "not-an-email" });
  assert.equal(result.success, false);
});

test("shareDocumentSchema accepts a well-formed email", () => {
  const result = shareDocumentSchema.safeParse({ email: "bob@example.com" });
  assert.equal(result.success, true);
});
