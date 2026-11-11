import { isMoving } from "./file-move.js";
import { exec, run, shared, setShared, panes, window, notify } from "herdr";
import { selectBeforeClosing } from "./tab-history.js";
export const TAB_KEY = "files-workspace.file-tabs";
const opening = new Set();
export const OPENING_KEY = "files-workspace.opening-tab";
export function fileKey(space, on, file) {
  const path = !on && window()?.platform === "windows" ? file.replaceAll("\\", "/").toLowerCase() : file;
  return JSON.stringify([space, on || null, path]);
}
export function tabContext(tab, space) {
  return Object.values(shared(TAB_KEY) || {}).find(entry => entry.tab === tab)
    || (space ? (shared(OPENING_KEY) || {})[space] : null);
}
// Match the machine and a complete path segment, including tabs in other spaces.
// Leave draft state intact: Document.close() flushes unsaved edits on teardown.
export function closeDeletedFileTabs(file, on = null, directory = false) {
  closeDeletedFiles([{ file, directory }], on);
}
export function closeDeletedFiles(files, on = null) {
  const normalize = path => !on && window()?.platform === "windows"
    ? path.replaceAll("\\", "/").replace(/\/+$/, "").toLowerCase()
    : path.replace(/\/+$/, "");
  const targets = files.map(item => ({ path: normalize(item.file), directory: item.directory }));
  const live = panes(), closed = new Set(), closing = new Set();
  for (const entry of Object.values(shared(TAB_KEY) || {})) {
    const tabPanes = live.filter(p => p.tab === entry.tab);
    if ((entry.on || null) !== (on || null) || !tabPanes.length || closed.has(entry.tab)) continue;
    const path = normalize(entry.file);
    if (!targets.some(target => path === target.path || (target.directory && path.startsWith(target.path + "/")))) continue;
    // A user can split a file tab and add a terminal. Never terminate it here.
    if (tabPanes.length > 1 || tabPanes[0].terminal) {
      notify({ title: "File deleted", body: "A split tab was kept open. Close its file pane manually.", level: "info" });
      closed.add(entry.tab); continue;
    }
    closing.add(entry.tab);
    closed.add(entry.tab);
  }
  selectBeforeClosing(closing);
  for (const id of closing) run("tab.close", { id });
}
export async function openFile({ space, on, root, file, projectRoot }) {
  if (isMoving({file,on})) throw new Error("This file is being copied or moved.");
  const key = fileKey(space, on, file);
  const existing = (shared(TAB_KEY) || {})[key];
  if (existing && panes().some(p => p.tab === existing.tab)) {
    // Reusing a tab must not restore the folder from its first opening.
    setShared(TAB_KEY, { ...(shared(TAB_KEY) || {}), [key]: { ...existing, root, projectRoot: projectRoot || root, on: on || null } });
    run("tab.select", { id: existing.tab }); return;
  }
  if (opening.has(key)) return;
  opening.add(key);
  try {
    const name = file.split(/[\\/]/).pop();
    const info = { key, file, root, projectRoot: projectRoot || root, on: on || null, space };
    setShared(OPENING_KEY, { ...(shared(OPENING_KEY) || {}), [space]: info });
    const media = /\.(png|jpe?g|gif|webp|bmp|svg|ico|tiff?|heic|heif|avif)$/i.test(file);
    const result = await exec("herdr-app", ["do", "tab.new", "--space", space, "--name", name,
      "--mod", "files-workspace", "--props", JSON.stringify(media ? { viewer: info } : { document: info })]);
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
