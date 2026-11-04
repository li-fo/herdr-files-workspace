import { exec, run, shared, setShared, panes, window } from "herdr";
export const TAB_KEY = "files-transfer.file-tabs";
const opening = new Set();
export const OPENING_KEY = "files-transfer.opening-tab";
export function fileKey(space, on, file) {
  const path = !on && window()?.platform === "windows" ? file.replaceAll("\\", "/").toLowerCase() : file;
  return JSON.stringify([space, on || null, path]);
}
export function tabContext(tab, space) {
  return Object.values(shared(TAB_KEY) || {}).find(entry => entry.tab === tab)
    || (space ? (shared(OPENING_KEY) || {})[space] : null);
}
export async function openFile({ space, on, root, file }) {
  const key = fileKey(space, on, file);
  const existing = (shared(TAB_KEY) || {})[key];
  if (existing && panes().some(p => p.tab === existing.tab)) {
    // Reusing a tab must not restore the folder from its first opening.
    setShared(TAB_KEY, { ...(shared(TAB_KEY) || {}), [key]: { ...existing, root, on: on || null } });
    run("tab.select", { id: existing.tab }); return;
  }
  if (opening.has(key)) return;
  opening.add(key);
  try {
    const name = file.split(/[\\/]/).pop();
    const info = { key, file, root, on: on || null, space };
    setShared(OPENING_KEY, { ...(shared(OPENING_KEY) || {}), [space]: info });
    const media = /\.(png|jpe?g|gif|webp|bmp|svg|ico|tiff?|heic|heif|avif)$/i.test(file);
    const result = await exec("herdr-app", ["do", "tab.new", "--space", space, "--name", name,
      "--mod", "files-transfer", "--props", JSON.stringify(media ? { viewer: info } : { document: info })]);
    if (result.code !== 0) throw new Error(result.stderr || result.stdout || "Cannot open file tab");
    const created = JSON.parse(result.stdout);
    if (!created.tab) throw new Error(created.error || "No file tab was created");
    const live = new Set(panes().map(p => p.tab));
    const registry = Object.fromEntries(Object.entries(shared(TAB_KEY) || {}).filter(([, value]) => live.has(value.tab)));
    setShared(TAB_KEY, { ...registry, [key]: { ...info, tab: created.tab } });
  } finally {
    const pending = { ...(shared(OPENING_KEY) || {}) };
    if (pending[space]?.key === key) { delete pending[space]; setShared(OPENING_KEY, pending); }
    opening.delete(key);
  }
}
