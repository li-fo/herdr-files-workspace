// Literal matching; offsets remain valid for Unicode and replacement strings.
export function matches(text, query, sensitive = false) {
  if (!query) return [];
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(escaped, sensitive ? "gu" : "giu"), out = [];
  let line = 1, scanned = 0, lineStart = 0;
  for (const m of text.matchAll(re)) {
    while (scanned < m.index) if (text[scanned++] === "\n") { line++; lineStart = scanned; }
    const start = m.index, end = start + m[0].length;
    out.push({ start, end, line, excerpt: text.slice(Math.max(lineStart, start - 60), start + 180).split("\n")[0] });
  }
  return out;
}
export function replaceMatches(text, found, replacement) {
  let result = "", start = 0;
  for (const match of found) { result += text.slice(start, match.start) + replacement; start = match.end; }
  return result + text.slice(start);
}
