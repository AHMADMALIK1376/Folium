// Minimal, dependency-free .txt / .md -> HTML converter used for file import.
// Deliberately small: it handles headings, bold, italic, and lists, which
// covers the formatting the editor itself supports. It is NOT a full
// CommonMark implementation -- documented as a known limitation in the README.

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function inlineFormat(s: string): string {
  let out = escapeHtml(s);
  out = out.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(?<!\*)\*(?!\*)(.+?)\*(?!\*)/g, "<em>$1</em>");
  return out;
}

export function markdownToHtml(md: string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const htmlLines: string[] = [];
  let listType: "ul" | "ol" | null = null;

  const closeList = () => {
    if (listType) {
      htmlLines.push(`</${listType}>`);
      listType = null;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    const bullet = line.match(/^[-*]\s+(.*)$/);
    const numbered = line.match(/^\d+\.\s+(.*)$/);

    if (heading) {
      closeList();
      const level = heading[1].length;
      htmlLines.push(`<h${level}>${inlineFormat(heading[2])}</h${level}>`);
    } else if (bullet) {
      if (listType !== "ul") {
        closeList();
        htmlLines.push("<ul>");
        listType = "ul";
      }
      htmlLines.push(`<li>${inlineFormat(bullet[1])}</li>`);
    } else if (numbered) {
      if (listType !== "ol") {
        closeList();
        htmlLines.push("<ol>");
        listType = "ol";
      }
      htmlLines.push(`<li>${inlineFormat(numbered[1])}</li>`);
    } else if (line.trim() === "") {
      closeList();
    } else {
      closeList();
      htmlLines.push(`<p>${inlineFormat(line)}</p>`);
    }
  }
  closeList();
  return htmlLines.join("");
}

export function plainTextToHtml(text: string): string {
  const paragraphs = text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
  if (paragraphs.length === 0) return "<p></p>";
  return paragraphs
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br/>")}</p>`)
    .join("");
}

export function titleFromFilename(filename: string): string {
  const base = filename.replace(/\.[^/.]+$/, "");
  return base.replace(/[-_]+/g, " ").trim() || "Imported document";
}
