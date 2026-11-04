export const MAX_TEXT = 1024 * 1024;
export function byteLength(text) {
  let count = 0;
  for (const char of text) { const n = char.codePointAt(0); count += n < 128 ? 1 : n < 2048 ? 2 : n < 65536 ? 3 : 4; }
  return count;
}
export class TextBuffer {
  constructor(raw) {
    if (typeof raw !== "string") throw new Error("File no longer exists.");
    if (byteLength(raw) > MAX_TEXT) throw new Error("Text editing is limited to 1 MiB; this file was not truncated.");
    if (/[\x00-\x08\x0e-\x1f]/.test(raw)) throw new Error("Binary file — text editing is unavailable.");
    this.bom = raw.startsWith("\ufeff") ? "\ufeff" : "";
    const body = raw.slice(this.bom.length);
    if (body.replaceAll("\r\n", "").includes("\r")) throw new Error("Unsupported CR-only line endings; open in an external editor.");
    if (body.includes("\r\n") && body.replaceAll("\r\n", "").includes("\n")) throw new Error("Mixed line endings; normalize them in an external editor before editing here.");
    this.eol = body.includes("\r\n") ? "\r\n" : "\n";
    this.baseRaw = raw;
    this.text = this.baseText = body.replaceAll("\r\n", "\n");
  }
  get dirty() { return this.text !== this.baseText; }
  snapshot() {
    const raw = this.bom + this.text.replaceAll("\r\n", "\n").replaceAll("\n", this.eol);
    if (byteLength(raw) > MAX_TEXT) throw new Error("Text exceeds 1 MiB; your edits have not been saved.");
    return { raw, text: this.text, expected: this.baseRaw };
  }
  saved(snapshot) { this.baseRaw = snapshot.raw; this.baseText = snapshot.text; }
}
