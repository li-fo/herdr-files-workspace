// Preserve ordinary fences; only top-level fenced Mermaid blocks become images.
export function markdownBlocks(text) {
  const lines = text.replaceAll("\r\n", "\n").split("\n");
  const blocks = []; let plain = [], fence = null, body = [];
  const flush = () => { if (plain.length) blocks.push({ kind: "markdown", text: plain.join("\n") }); plain = []; };
  for (const line of lines) {
    if (!fence) {
      const match = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(line);
      if (match) { fence = { char: match[2][0], count: match[2].length, mermaid: match[3].trim().toLowerCase() === "mermaid", start: line }; body = []; }
      else plain.push(line);
    } else if (new RegExp("^ {0,3}" + fence.char + "{" + fence.count + ",}\\s*$").test(line)) {
      if (fence.mermaid) { flush(); blocks.push({ kind: "mermaid", text: body.join("\n") }); }
      else plain.push(fence.start, ...body, line);
      fence = null;
    } else body.push(line);
  }
  if (fence) plain.push(fence.start, ...body);
  flush(); return blocks;
}
