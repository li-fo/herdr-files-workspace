import { shared, setShared } from "herdr";
import { TextBuffer } from "./text-buffer.js";
const draftKey = key => "files-transfer.draft:" + key;
export function readDraft(key) { return shared(draftKey(key)); }
export function persistDraft(key, buffer, version) {
  if (buffer.dirty) setShared(draftKey(key), { baseRaw: buffer.baseRaw, text: buffer.text, version });
  else if (readDraft(key)) setShared(draftKey(key), null);
}
export function restoreDraft(key, loaded) {
  const draft = readDraft(key);
  if (draft && typeof draft.baseRaw === "string" && typeof draft.text === "string") {
    const buffer = new TextBuffer(draft.baseRaw); buffer.text = draft.text;
    let savedRaw;
    try { savedRaw = buffer.snapshot().raw; } catch { /* Oversized edits must remain recoverable. */ }
    if (loaded && (loaded.text === savedRaw || !buffer.dirty)) {
      setShared(draftKey(key), null);
    } else {
      return { buffer, version: draft.version, recovered: true,
        note: loaded && loaded.text !== buffer.baseRaw ? "Recovered draft. The file also changed on disk; Save will check for conflicts." : "Recovered unsaved changes." };
    }
  }
  return { buffer: new TextBuffer(loaded?.text), version: loaded?.version, recovered: false, note: null };
}
