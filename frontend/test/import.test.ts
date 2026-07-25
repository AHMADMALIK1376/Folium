import { test } from "node:test";
import assert from "node:assert/strict";
import { markdownToHtml, plainTextToHtml, titleFromFilename } from "../src/lib/importFile.ts";

test("markdownToHtml converts headings, bold, italic, and lists", () => {
  const html = markdownToHtml("# Title\n\nSome **bold** and *italic* text.\n\n- one\n- two");
  assert.match(html, /<h1>Title<\/h1>/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<em>italic<\/em>/);
  assert.match(html, /<ul><li>one<\/li><li>two<\/li><\/ul>/);
});

test("markdownToHtml escapes raw HTML in the source so it can't inject markup", () => {
  const html = markdownToHtml("<script>alert(1)</script>");
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});

test("plainTextToHtml splits on blank lines into paragraphs", () => {
  const html = plainTextToHtml("First paragraph.\n\nSecond paragraph.");
  assert.equal(html, "<p>First paragraph.</p><p>Second paragraph.</p>");
});

test("titleFromFilename strips the extension and cleans separators", () => {
  assert.equal(titleFromFilename("q3-roadmap_draft.md"), "q3 roadmap draft");
  assert.equal(titleFromFilename(".md"), "Imported document");
});
