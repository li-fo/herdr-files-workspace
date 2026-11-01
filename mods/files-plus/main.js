// Files+: Herdr's Files panel with VS Code's Material Icon Theme icons and file transfer.
// A lazy file browser for the focused pane's folder, with bounded read-only previews, and a
// right-click menu that downloads, uploads (paste from Finder, or drop), copies paths and deletes,
// on this computer or on the remote machine the space runs on (over ssh).
//
// Based on File Icons by amster93 (https://github.com/amster93/herdr-file-icons, Apache-2.0),
// itself modified from Herdr's shipped `files` mod (https://github.com/herdrdev/herdr-app,
// Apache-2.0). Added here: the menu, transfers, delete, drop, English/Russian text.
import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex, Editor, EditorState } from "gpui-base";
import { spaces, panes, focused, exec, readTextFile, watchFolder, theme, settings, window, props, openOverlay, closeOverlay, shared, setShared, notify, hc, appHome, home } from "herdr";
import ICONS from "./icons.js";

// Right-click menu on a file or folder: download it to ~/Downloads (scp from a remote
// machine, cp here), paste files copied in Finder into it (upload), copy its path, show it
// in Finder, delete it after a confirmation. Files dropped from Finder upload too. The menu
// and the confirmation are this mod opened as a popup / dialog (props().menu, .confirm);
// they hand the choice to the panel that opened them through shared "files.request", since
// an overlay's tasks end when it closes and a transfer can take long.
const REQUEST = "files-plus.request";
const LANG_KEY = "files-plus.lang";
const MENU_ROW = 31;
// Our temporary folders, never listed in the tree.
const TEMP = /^\.herdr-(upload|download)\./;
// Runs detached so a download isn't bound by exec's 30 s. It fetches into a hidden
// temporary folder next to the target, then claims a free name atomically ("a (1).txt")
// and writes that path to <status>.dest and the exit code to <status>.
const FETCH = `src=$1 dir=$2 name=$3 st=$4 mode=$5 isdir=$6
mkdir -p "$dir" "\${st%/*}" || exit 1
rm -f "$st" "$st.dest"
tmp=$(mktemp -d "$dir/.herdr-download.XXXXXX") || exit 1
nohup sh -c '
mode=$1 src=$2 tmp=$3 dir=$4 name=$5 isdir=$6 st=$7
if [ "$mode" = scp ]; then scp -r -p -o BatchMode=yes -o ConnectTimeout=15 "$src" "$tmp/$name"; else cp -R -p "$src" "$tmp/$name"; fi >"$st.log" 2>&1
code=$?
if [ $code = 0 ]; then
  base=$name ext=
  if [ "$isdir" != 1 ]; then case "$name" in ?*.*) base=\${name%.*} ext=.\${name##*.};; esac; fi
  dest="$dir/$name" i=0
  if [ "$isdir" = 1 ]; then
    while ! mkdir "$dest" 2>/dev/null; do [ -e "$dest" ] || { code=1; break; }; i=$((i+1)); dest="$dir/$base ($i)$ext"; done
    if [ $code = 0 ]; then (cd "$tmp/$name" && for f in * .[!.]* ..?*; do if [ -e "$f" ] || [ -L "$f" ]; then mv "$f" "$dest/" || exit 1; fi; done) || code=1; fi
  else
    while ! ln "$tmp/$name" "$dest" 2>/dev/null; do [ -e "$dest" ] || { code=1; break; }; i=$((i+1)); dest="$dir/$base ($i)$ext"; done
  fi
  [ $code = 0 ] && printf %s "$dest" >"$st.dest"
fi
rm -rf "$tmp"
echo $code >"$st"' fetch "$mode" "$src" "$tmp" "$dir" "$name" "$isdir" "$st" </dev/null >/dev/null 2>&1 &`;

// Upload, detached like FETCH: copies local files into a temporary folder on the target
// (made beforehand with mktemp there) and writes the exit code to <status>.
const SEND = `st=$1 mode=$2 dest=$3; shift 3
mkdir -p "\${st%/*}" || exit 1
rm -f "$st"
nohup sh -c 'st=$1 mode=$2 dest=$3; shift 3
if [ "$mode" = scp ]; then scp -r -p -o BatchMode=yes -o ConnectTimeout=15 "$@" "$dest"; else cp -R -p "$@" "$dest"; fi >"$st.log" 2>&1
echo $? >"$st"' send "$st" "$mode" "$dest" "$@" </dev/null >/dev/null 2>&1 &`;

// Runs on the target machine once an upload is in: moves each uploaded item from the
// temporary folder into place under a free name, prints the names it used, removes the folder.
const PLACE = `tmp=$1 dir=$2
for p in "$tmp"/* "$tmp"/.[!.]* "$tmp"/..?*; do
  [ -e "$p" ] || [ -L "$p" ] || continue
  name=\${p##*/} base=\${p##*/} ext= i=0 dest="$dir/\${p##*/}"
  if [ -d "$p" ] && [ ! -L "$p" ]; then
    while ! mkdir "$dest" 2>/dev/null; do [ -e "$dest" ] || exit 1; i=$((i+1)); dest="$dir/$name ($i)"; done
    (cd "$p" && for f in * .[!.]* ..?*; do if [ -e "$f" ] || [ -L "$f" ]; then mv "$f" "$dest/" || exit 1; fi; done) || exit 1
  else
    case "$name" in ?*.*) base=\${name%.*} ext=.\${name##*.};; esac
    while ! ln "$p" "$dest" 2>/dev/null; do [ -e "$dest" ] || exit 1; i=$((i+1)); dest="$dir/$base ($i)$ext"; done
  fi
  printf '%s\\n' "\${dest##*/}"
done
rm -rf "$tmp"`;

// Files copied in Finder (⌘C): their paths, from the general pasteboard.
const CLIPBOARD = `ObjC.import("AppKit");
const urls = $.NSPasteboard.generalPasteboard.readObjectsForClassesOptions($.NSArray.arrayWithObject($.NSURL),
  $.NSDictionary.dictionaryWithObjectForKey(true, "NSPasteboardURLReadingFileURLsOnlyKey"));
const out = [];
if (urls) for (let i = 0; i < urls.count; i++) out.push(urls.objectAtIndex(i).path.js);
JSON.stringify(out);`;

// The ssh target behind a Herdr machine name (hc machine ls: "dev@host" or an ssh-config alias).
async function sshTarget(machine) {
  const r = await hc(["machine", "ls", "--json"]);
  const m = JSON.parse(r.stdout || "{}").machines?.find(x => x.name === machine);
  if (!m?.target) throw new Error(`No ssh address for machine ${machine}`);
  return m.target;
}

// Interface text: Russian when macOS is set to Russian, else English (see init).
const STRINGS = {
  en: {
    pasteHere: "Paste here", pasteInto: "Paste into this folder", pasteBeside: "Paste here",
    download: "Download to Downloads", downloadFolder: "Download folder to Downloads",
    copyPath: "Copy path", reveal: "Reveal in Finder", delete: "Delete…",
    pathCopied: "Path copied", nothingToPaste: "Nothing to paste",
    nothingToPasteBody: "Copy a file or folder in Finder (⌘C), then choose Paste.",
    tooDangerous: (p) => `Refusing to delete ${p}`, deleted: (n) => `Deleted ${n}`,
    downloadFailed: (n) => `Couldn't download ${n}`, uploadFailed: (n) => n ? `Couldn't upload ${n}` : "Couldn't upload",
    deleteFailed: (n) => `Couldn't delete ${n}`, failed: "Something went wrong", code: (c) => `exit code ${c}`,
    items: (n) => `${n} ${n === 1 ? "item" : "items"}`, downloaded: (n) => `Downloaded ${n}`, uploaded: (n) => `Uploaded ${n}`,
    askDelete: (dir, n) => `Delete ${dir ? "folder" : "file"} “${n}”?`,
    deleteDetail: (dir) => dir ? "The folder and everything in it will be deleted. This can't be undone." : "This can't be undone.",
    cancel: "Cancel", confirmDelete: "Delete",
    uploading: (n) => `Uploading ${n}…`, downloading: (n) => `Downloading ${n}…`, transferring: (n) => `Transferring ${n}…`,
  },
  ru: {
    pasteHere: "Вставить сюда", pasteInto: "Вставить в эту папку", pasteBeside: "Вставить рядом",
    download: "Скачать в Загрузки", downloadFolder: "Скачать папку в Загрузки",
    copyPath: "Скопировать путь", reveal: "Показать в Finder", delete: "Удалить…",
    pathCopied: "Путь скопирован", nothingToPaste: "Нечего вставить",
    nothingToPasteBody: "Скопируйте файл или папку в Finder (⌘C), потом выберите «Вставить».",
    tooDangerous: (p) => `Слишком опасный путь: ${p}`, deleted: (n) => `Удалено: ${n}`,
    downloadFailed: (n) => `Не удалось скачать ${n}`, uploadFailed: (n) => n ? `Не удалось загрузить ${n}` : "Не удалось загрузить",
    deleteFailed: (n) => `Не удалось удалить ${n}`, failed: "Не получилось", code: (c) => `код ${c}`,
    items: (n) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? "объект" : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? "объекта" : "объектов"}`,
    downloaded: (n) => `Скачано: ${n}`, uploaded: (n) => `Загружено: ${n}`,
    askDelete: (dir, n) => `Удалить ${dir ? "папку" : "файл"} «${n}»?`,
    deleteDetail: (dir) => dir ? "Папка будет удалена со всем содержимым. Это нельзя отменить." : "Это нельзя отменить.",
    cancel: "Отмена", confirmDelete: "Удалить",
    uploading: (n) => `Загружается ${n}…`, downloading: (n) => `Скачивается ${n}…`, transferring: (n) => `Передаётся: ${n}…`,
  },
};
const T = () => STRINGS[shared(LANG_KEY)] ?? STRINGS.en;

const parentOf = path => path.slice(0, path.lastIndexOf("/")) || "/";

// A menu row is [action, label, icon]; null draws a divider.
const MENU = (target, t = T()) => target.root
  ? [["paste", t.pasteHere, "paste.svg"], ["copy", t.copyPath, "copy.svg"]]
  : [
      ["download", target.dir ? t.downloadFolder : t.download, "download.svg"],
      ["paste", target.dir ? t.pasteInto : t.pasteBeside, "paste.svg"],
      ["copy", t.copyPath, "copy.svg"],
      ...(target.on ? [] : [["reveal", t.reveal, "finder.svg"]]),
      null,
      ["delete", t.delete, "trash.svg"],
    ];
const menuHeight = list => list.reduce((h, it) => h + (it ? MENU_ROW : 9), 10);

function location() {
  const space = spaces().find(s => s.active), f = focused();
  const pane = f?.pane ? panes().find(p => p.pane === f.pane) : null;
  const on = f?.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : space?.machine ?? null;
  return { cwd: pane?.cwd || f?.cwd || space?.folder, on };
}
const key = () => JSON.stringify(location());
const LANG = { ts: "js", tsx: "js", mts: "js", cts: "js", jsx: "js", mjs: "js", toml: "yaml", jsonc: "json", svelte: "html", vue: "html" };
const PER_FOLDER = 500, TOTAL = 5000;
const DIR = "mods/files-plus";

// Material Icon Theme's rules, as VS Code applies them: names match case-insensitively; a
// path rule (".github/workflows") beats a name, a name beats an extension, and the longest
// extension wins ("spec.ts" over "ts"). Light themes check the theme's light table first.
const bare = name => name.replace(/^__(.+)__$/, "$1").replace(/^[._-]/, "");
const opened = id => id.endsWith("_light") ? `${id.slice(0, -6)}-open_light` : `${id}-open`;
function lookup(table, key, dark) { return (dark ? undefined : ICONS.light[table][key]) ?? ICONS[table][key]; }
function icon(path, dir, open, dark) {
  const parts = path.toLowerCase().split("/"), name = parts[parts.length - 1];
  const table = dir ? "folderNames" : "fileNames", find = key => lookup(table, key, dark) ?? (dir ? lookup(table, bare(key), dark) : undefined);
  let id;
  for (let i = 0; !id && i < parts.length - 1; i++) id = find(parts.slice(i).join("/"));
  if (dir) {
    id ??= find(name) ?? ICONS.folder;
    return `${DIR}/icons/${open ? opened(id) : id}.svg`;
  }
  id ??= lookup(table, name, dark);
  for (let dot = name.indexOf("."); !id && dot !== -1; dot = name.indexOf(".", dot + 1)) id = lookup("fileExtensions", name.slice(dot + 1), dark);
  return `${DIR}/icons/${id ?? ICONS.file}.svg`;
}

async function directory(path, on) {
  if (!on && window()?.platform === "windows") {
    const r = await exec("powershell", ["-NoProfile", "-Command", "& { param($p) @(Get-ChildItem -LiteralPath $p -Force -ErrorAction Stop | Where-Object Name -ne '.git' | Select-Object -First 501 | ForEach-Object { @{ name=$_.Name; dir=($_.PSIsContainer -and -not ($_.Attributes -band [IO.FileAttributes]::ReparsePoint)) } }) | ConvertTo-Json -Compress }", path]);
    if (r.code !== 0) throw new Error(r.stderr || "Cannot list this folder");
    const result = JSON.parse(r.stdout || "[]");
    return Array.isArray(result) ? result : [result];
  }
  const script = 'n=0; for p in "$1"/* "$1"/.[!.]* "$1"/..?*; do [ -e "$p" ] || [ -L "$p" ] || continue; name=${p##*/}; [ "$name" = .git ] && continue; if [ -d "$p" ] && [ ! -L "$p" ]; then kind=d; else kind=f; fi; printf "%s\\0%s\\0" "$kind" "$name"; n=$((n+1)); [ "$n" -gt 500 ] && break; done; test -d "$1"';
  const r = await exec("sh", ["-c", script, "files", path], { on });
  if (r.code !== 0) throw new Error(r.stderr || "Cannot list this folder");
  const fields = r.stdout.split("\0"), out = [];
  for (let i = 0; i + 1 < fields.length; i += 2) out.push({ name: fields[i + 1], dir: fields[i] === "d" });
  return out;
}

export default class Files extends View {
  init(_props, cx) {
    if (props()?.menu || props()?.confirm) { this.at = 0; this.handle = cx.focus_handle(); this.handle.focus(); return; }
    // Which panel a menu choice is for: the one that opened the menu.
    this.me = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    this.jobs = [];
    // ⌘V pastes into the selected row's folder: the panel takes the keyboard when clicked.
    this.keys = cx.focus_handle();
    this.selected = null; // { path, dir } inside the shown folder
    cx.spawn(async cx => {
      const r = await exec("defaults", ["read", "-g", "AppleLanguages"]).catch(() => null);
      const lang = /^\W*"?ru/m.test(r?.stdout?.split("\n").find(l => /\w/.test(l) && !/^\s*\(/.test(l)) ?? "") ? "ru" : "en";
      if (shared(LANG_KEY) !== lang) setShared(LANG_KEY, lang);
    });
    cx.timer.every(1000, cx => this.poll(cx));
    this.entries = new Map(); this.folders = new Set(); this.pending = new Set(); this.marks = {};
    this.refresh(cx);
    cx.timer.every(10000, cx => this.refresh(cx));
  }

  watch(root, cx) {
    if (this.on || this.watched === root) return;
    this.watched = root;
    cx.spawn(async cx => {
      try { while (this.watched === root) { await watchFolder(root); if (this.watched === root) this.refresh(cx); } }
      catch { if (this.watched === root) this.watched = null; }
    });
  }

  async loadFolder(path, context) {
    const on = this.on, root = this.root;
    const entries = (await directory(path ? `${root}/${path}` : root, on)).filter(e => !TEMP.test(e.name));
    if (key() !== context || (path && !this.folders.has(path))) return;
    const used = [...this.entries.entries()].filter(([p]) => p !== path).reduce((n, [, e]) => n + e.length, 0);
    this.entries.set(path, entries.slice(0, Math.max(0, Math.min(PER_FOLDER, TOTAL - used))).sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name)));
    if (entries.length > PER_FOLDER || used + entries.length > TOTAL) this.limited = true;
  }

  refresh(cx) {
    if (this.loading) return;
    const { cwd, on } = location(), context = key();
    if (context !== this.context) {
      this.context = context; this.root = cwd; this.on = on; this.entries = new Map(); this.folders = new Set();
      this.pending = new Set(); this.marks = {}; this.selected = null; this.show(null); this.watched = null; this.error = null; this.limited = false;
    }
    if (!cwd) return;
    this.loading = true;
    this.limited = false;
    cx.spawn(async cx => {
      try {
        for (const path of ["", ...this.folders]) await this.loadFolder(path, context);
        const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd, on }).catch(() => null);
        const marks = {};
        if (top?.code === 0) {
          // Writes nothing under .git (index lock, fsmonitor cookie): the folder watch would refresh again.
          const status = await exec("git", ["--no-optional-locks", "-c", "core.fsmonitor=false", "status", "--porcelain=v1", "-z", "--no-renames", "--untracked-files=normal"], { cwd, on }).catch(() => null);
          if (status?.code === 0) for (const entry of status.stdout.split("\0").filter(Boolean).slice(0, TOTAL)) {
            const xy = entry.slice(0, 2);
            marks[`${top.stdout.trim()}/${entry.slice(3)}`] = xy === "??" || xy.includes("A") ? "A" : xy.includes("U") ? "U" : xy.includes("D") ? "D" : "M";
          }
        }
        if (key() !== context) return;
        this.marks = marks; this.error = null; this.watch(cwd, cx);
      } catch (e) { if (key() === context) this.error = String(e); }
      finally { this.loading = false; cx.notify(); }
    });
  }

  toggle(path, cx) {
    if (this.folders.has(path)) {
      for (const folder of [...this.folders]) if (folder === path || folder.startsWith(path + "/")) {
        this.folders.delete(folder);
        this.entries.delete(folder);
      }
    } else {
      this.folders.add(path);
      if (!this.entries.has(path) && !this.pending.has(path)) {
        const context = this.context;
        this.pending.add(path);
        cx.spawn(async cx => {
          try { await this.loadFolder(path, context); }
          catch (e) { if (key() === context) this.error = String(e); }
          finally { this.pending.delete(path); cx.notify(); }
        });
      }
    }
    cx.notify();
  }

  show(path, cx) {
    this.code?.release(); this.code = null; this.file = path; this.fileError = null;
    if (!path || !cx) return;
    const context = this.context, root = this.root, on = this.on;
    cx.spawn(async cx => {
      try {
        const text = await readTextFile(`${root}/${path}`, { on });
        if (this.file !== path || key() !== context) return;
        if (text === null) { this.fileError = "This file is no longer available"; return; }
        if (text.includes("\0")) { this.fileError = "Binary file · no text preview"; return; }
        const t = theme(), ext = path.includes(".") ? path.split(".").pop() : "txt";
        this.code = EditorState.new({ language: LANG[ext] ?? ext, readonly: true,
          value: text.length > 400000 ? text.slice(0, 400000) + "\n… (file truncated)" : text,
          font_family: settings().font_family, font_size: 12,
          syntax: { keyword: t.ansi5, string: t.ansi2, comment: t.dim, function: t.ansi4, type: t.ansi3, number: t.ansi1, constant: t.ansi6 } });
      } catch { if (this.file === path && key() === context) this.fileError = "Cannot preview this file (binary, too large, or unreadable)"; }
      finally { cx.notify(); }
    });
  }

  // path: inside the shown folder ("" for the folder itself).
  openMenu(path, dir) {
    const target = path
      ? { path: `${this.root}/${path}`, name: path.split("/").pop(), dir, on: this.on ?? null, from: this.me }
      : { path: this.root, name: this.root.split("/").pop(), dir: true, root: true, on: this.on ?? null, from: this.me };
    openOverlay({ mod: "files-plus", kind: "popup", width: 250, height: menuHeight(MENU(target)), props: { menu: target } });
  }

  // A choice made in the menu or the confirmation, for this panel.
  take(cx) {
    const req = shared(REQUEST);
    if (!req || req.from !== this.me || req.id === this.lastRequest) return;
    this.lastRequest = req.id;
    setShared(REQUEST, null);
    const { action, path, name, dir, on } = req;
    if (action === "delete") {
      openOverlay({ mod: "files-plus", kind: "dialog", width: 420, height: 176, props: { confirm: { path, name, dir, on, from: this.me } } });
      return;
    }
    cx.spawn(async cx => {
      try {
        if (action === "copy") {
          await exec("sh", ["-c", 'printf %s "$1" | pbcopy', "copy", path]);
          notify({ title: T().pathCopied, body: path, level: "info", timeout: 2500 });
        } else if (action === "reveal") {
          await exec("open", ["-R", path]);
        } else if (action === "download") {
          await this.download(path, name, dir, on);
        } else if (action === "paste") {
          await this.paste(dir ? path : parentOf(path), on);
        } else if (action === "delete-yes") {
          // Never the shown folder itself, the home folder or a root-level path.
          if (path === this.root || path.split("/").filter(Boolean).length < 2) throw new Error(T().tooDangerous(path));
          const r = await exec("rm", ["-rf", "--", path], { on });
          if (r.code !== 0) throw new Error((r.stderr || `exit ${r.code}`).trim());
          notify({ title: T().deleted(name), body: on ? `${on}:${path}` : path, level: "success", timeout: 4000 });
          if (this.file && `${this.root}/${this.file}`.startsWith(path)) this.show(null);
          this.refresh(cx);
        }
      } catch (e) {
        const what = { download: T().downloadFailed(name), paste: T().uploadFailed(), "delete-yes": T().deleteFailed(name) }[action] ?? T().failed;
        notify({ title: what, body: String(e.message ?? e), level: "error" });
      }
      cx.notify();
    });
  }

  // Files copied in Finder, uploaded into folder (absolute, on the machine `on`).
  async paste(folder, on) {
    const r = await exec("osascript", ["-l", "JavaScript", "-e", CLIPBOARD]);
    const files = r.code === 0 ? JSON.parse(r.stdout.trim() || "[]") : [];
    if (!files.length) return notify({ title: T().nothingToPaste, body: T().nothingToPasteBody, level: "warning", timeout: 5000 });
    await this.upload(files, folder, on);
  }

  // ⌘V: into the selected folder, beside the selected file, else into the shown folder.
  pasteKey(cx) {
    if (!this.root) return;
    const sel = this.selected;
    const folder = !sel ? this.root : sel.dir ? `${this.root}/${sel.path}` : parentOf(`${this.root}/${sel.path}`);
    const on = this.on ?? null;
    cx.spawn(async cx => {
      try { await this.paste(folder, on); }
      catch (e) { notify({ title: T().uploadFailed(), body: String(e.message ?? e), level: "error" }); }
      cx.notify();
    });
  }

  async download(path, name, dir, on) {
    const src = on ? `${await sshTarget(on)}:${path}` : path;
    const status = `${appHome()}/data/files-transfer/${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const r = await exec("sh", ["-c", FETCH, "fetch", src, `${home()}/Downloads`, name, status, on ? "scp" : "cp", dir ? "1" : "0"]);
    if (r.code !== 0) throw new Error((r.stderr || `exit ${r.code}`).trim());
    this.jobs.push({ kind: "download", status, name });
  }

  // Local files into dir on the shown folder's machine: into a temporary folder there
  // first, then into place under free names (PLACE), so nothing is overwritten.
  async upload(files, dir, on) {
    const mk = await exec("mktemp", ["-d", `${dir}/.herdr-upload.XXXXXX`], { on });
    if (mk.code !== 0) throw new Error((mk.stderr || `exit ${mk.code}`).trim());
    const tmp = mk.stdout.trim();
    const dest = on ? `${await sshTarget(on)}:${tmp}/` : `${tmp}/`;
    const status = `${appHome()}/data/files-transfer/${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const r = await exec("sh", ["-c", SEND, "send", status, on ? "scp" : "cp", dest, ...files]);
    if (r.code !== 0) {
      await exec("rm", ["-rf", "--", tmp], { on }).catch(() => {});
      throw new Error((r.stderr || `exit ${r.code}`).trim());
    }
    const name = files.length === 1 ? files[0].split("/").pop() : T().items(files.length);
    this.jobs.push({ kind: "upload", status, name, tmp, dir, on });
  }

  // Finished transfers write their exit code to the status file.
  poll(cx) {
    if (!this.jobs?.length) return;
    cx.spawn(async cx => {
      let changed = false;
      for (const job of [...this.jobs]) {
        const code = await readTextFile(job.status).catch(() => null);
        if (code === null) continue;
        this.jobs = this.jobs.filter(j => j !== job);
        changed = true;
        const ok = code.trim() === "0";
        const log = (await readTextFile(`${job.status}.log`).catch(() => null))?.trim();
        const fail = log?.split("\n").pop() || T().code(code.trim());
        if (job.kind === "download") {
          const dest = (await readTextFile(`${job.status}.dest`).catch(() => null)) || `${home()}/Downloads/${job.name}`;
          if (ok) notify({ title: T().downloaded(dest.split("/").pop()), body: dest.replace(home(), "~"), level: "success", timeout: 6000 });
          else notify({ title: T().downloadFailed(job.name), body: fail, level: "error" });
        } else {
          try {
            if (!ok) throw new Error(fail);
            const r = await exec("sh", ["-c", PLACE, "place", job.tmp, job.dir], { on: job.on });
            if (r.code !== 0) throw new Error((r.stderr || `exit ${r.code}`).trim());
            const names = r.stdout.trim().split("\n").filter(Boolean);
            notify({ title: T().uploaded(names.length === 1 ? names[0] : T().items(names.length)),
              body: job.on ? `${job.on}:${job.dir}` : job.dir.replace(home(), "~"), level: "success", timeout: 6000 });
          } catch (e) {
            notify({ title: T().uploadFailed(job.name), body: String(e.message ?? e), level: "error" });
          }
          await exec("rm", ["-rf", "--", job.tmp], { on: job.on }).catch(() => {});
          this.refresh(cx);
        }
        await exec("rm", ["-f", job.status, `${job.status}.log`, `${job.status}.dest`]).catch(() => {});
      }
      if (changed) cx.notify();
    });
  }

  // Files dragged in from Finder: uploaded into dir (a folder inside the shown one, "" for it).
  drop(paths, dir, cx) {
    if (!paths?.length || !this.root) return;
    const target = dir ? `${this.root}/${dir}` : this.root, on = this.on ?? null;
    cx.spawn(async cx => {
      try { await this.upload(paths, target, on); }
      catch (e) { notify({ title: T().uploadFailed(), body: String(e.message ?? e), level: "error" }); }
      cx.notify();
    });
  }

  menu(t) {
    const target = props().menu, list = MENU(target), items = list.filter(Boolean);
    const choose = it => {
      setShared(REQUEST, { id: `${Date.now()}-${Math.random()}`, action: it[0], ...target });
      closeOverlay(props().overlay);
    };
    return v_flex().id("files-menu").track_focus(this.handle).w_full().p(5).bg(t.popover).text_size(12.8)
      .on_key_down((e, cx) => {
        if (e.key === "down") this.at = (this.at + 1) % items.length;
        else if (e.key === "up") this.at = (this.at + items.length - 1) % items.length;
        else if (e.key === "enter") choose(items[this.at]);
        else if (e.key === "escape") closeOverlay(props().overlay);
        else return;
        cx.notify();
      })
      .children(list.map((it, n) => {
        if (!it) return div().mx(7).my(4).h(1).bg(t.border);
        const i = items.indexOf(it), danger = it[0] === "delete";
        return h_flex().id(`fm-${n}`).h(MENU_ROW).px(8).gap(9).rounded(7).items_center().cursor_pointer()
          .when(i === this.at, el => el.bg(t.hover)).hover(s => s.bg(t.hover))
          .on_hover((on, cx) => { if (on && this.at !== i) { this.at = i; cx.notify(); } })
          .on_click(() => choose(it))
          .child(svg(`${DIR}/${it[2]}`).size(14).flex_none().text_color(danger ? t.ansi1 : t.muted))
          .child(div().flex_1().min_w(0).truncate().text_color(danger ? t.ansi1 : t.foreground).child(it[1]));
      }));
  }

  // "Delete …?" with the path and the machine; Enter deletes, Esc cancels.
  confirm(t) {
    const c = props().confirm;
    const yes = () => {
      setShared(REQUEST, { id: `${Date.now()}-${Math.random()}`, action: "delete-yes", ...c });
      closeOverlay(props().overlay);
    };
    const button = (id, label, bg, fg, border, act) => h_flex().id(id).h(32).px(14).items_center().rounded(8).border_1().border_color(border).bg(bg)
      .text_color(fg).cursor_pointer().hover(s => s.opacity(0.88)).on_click(act).child(label);
    return v_flex().id("files-confirm").track_focus(this.handle).size_full().min_h(0).p(18).gap(10).bg(t.popover).text_size(13)
      .on_key_down((e, cx) => {
        if (e.key === "enter") yes();
        else if (e.key === "escape") closeOverlay(props().overlay);
        else return;
        cx.stop_propagation();
      })
      .child(div().font_semibold().text_size(14).text_color(t.foreground).truncate().child(T().askDelete(c.dir, c.name)))
      .child(div().text_size(12).text_color(t.muted).truncate().child(c.on ? `${c.on}:${c.path}` : c.path))
      .child(div().text_size(12).text_color(t.dim).child(T().deleteDetail(c.dir)))
      .child(h_flex().flex_1().items_end().justify_end().gap(8)
        .child(button("no", T().cancel, t.popover, t.foreground, t.input, () => closeOverlay(props().overlay)))
        .child(button("yes", T().confirmDelete, t.ansi1, t.background, t.ansi1, yes)));
  }

  select(path, dir) {
    this.selected = { path, dir };
    this.keys?.focus();
  }

  rows(prefix, depth, out, t, dark) {
    if (out.length >= TOTAL || depth > 40) return out;
    for (const entry of this.entries.get(prefix) ?? []) {
      if (out.length >= TOTAL) break;
      const path = prefix ? `${prefix}/${entry.name}` : entry.name, open = this.folders.has(path), mark = this.marks[`${this.root}/${path}`];
      out.push(h_flex().id(`file-${path}`).h(28).flex_none().pl(8 + depth * 18).pr(8).gap(7).items_center().rounded(7).cursor_pointer()
        .when(this.selected?.path === path, el => el.bg(t.selected)).hover(s => s.bg(t.hover))
        .on_click((_e, cx) => { this.select(path, entry.dir); entry.dir ? this.toggle(path, cx) : this.show(path, cx); })
        .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); this.select(path, entry.dir); cx.notify(); this.openMenu(path, entry.dir); })
        .on_drop((e, cx) => { cx.stop_propagation(); this.drop(e.paths, entry.dir ? path : prefix, cx); })
        .child(entry.dir ? svg(`${DIR}/chevron-${open ? "down" : "right"}.svg`).size(12).flex_none().text_color(t.dim) : div().w(12).flex_none())
        .child(image(icon(path, entry.dir, open, dark)).size(16).flex_none())
        .child(div().flex_1().min_w(0).truncate().child(entry.name))
        .when(Boolean(mark), el => el.child(div().text_size(11).text_color(mark === "A" ? t.ansi2 : mark === "D" || mark === "U" ? t.ansi1 : t.blocked).child(mark))));
      if (entry.dir && open) this.rows(path, depth + 1, out, t, dark);
    }
    return out;
  }

  render(cx) {
    if (props()?.menu) return this.menu(theme());
    if (props()?.confirm) return this.confirm(theme());
    this.take(cx);
    if (key() !== this.context) this.refresh(cx);
    const t = theme(), dark = Boolean(settings().dark);
    return v_flex().id("files").track_focus(this.keys).size_full().min_h(0)
      .on_key_down((e, cx) => {
        if (e.keystroke === "cmd-v") { cx.stop_propagation(); this.pasteKey(cx); }
        else if (e.keystroke === "escape" && this.selected) { cx.stop_propagation(); this.selected = null; cx.notify(); }
      }).rounded(10).overflow_hidden().bg(t.background).border_1().border_color(t.border).text_color(t.foreground).text_size(13)
      .child(h_flex().h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
        .when(Boolean(this.file), el => el.child(div().id("files-back").w(20).cursor_pointer().text_color(t.muted).on_click((_e, cx) => { this.show(null); cx.notify(); }).child("←")))
        .child(div().font_semibold().child("Files"))
        .child(h_flex().flex_1().min_w(0).gap(6).justify_end().items_center().text_size(12).text_color(t.dim)
          .when(Boolean(this.file), el => el.child(image(icon(this.file, false, false, dark)).size(14).flex_none()))
          .child(div().min_w(0).truncate().child(this.file ?? this.root?.split(/[\\/]/).pop() ?? ""))))
      .when(!this.file, el => el.child(v_flex().id("files-tree").flex_1().min_h(0).overflow_y_scrollbar().p(6)
        .on_mouse_down("left", (_e, cx) => { this.selected = null; this.keys.focus(); cx.notify(); })
        .on_mouse_down("right", () => this.root && this.openMenu("", true))
        .on_drop((e, cx) => this.drop(e.paths, "", cx)).children(this.rows("", 0, [], t, dark))
        .when(Boolean(this.error) || !this.entries.get("")?.length, el => el.child(div().p(8).text_size(12).text_color(t.dim).child(this.error || (this.loading ? "Loading files…" : this.root ? "No files" : "No folder"))))
        .when(this.limited, el => el.child(div().p(8).text_size(11).text_color(t.dim).child("File list limited to 500 entries per folder and 5,000 total")))))
      .when(Boolean(this.file), el => el.child(this.code ? Editor.new(this.code).flex_1().min_h(0) : div().p(12).text_color(t.dim).child(this.fileError || "Loading file…")))
      .when(this.jobs.length > 0, el => el.child(h_flex().h(30).flex_none().px(14).gap(8).items_center().border_t(1).border_color(t.border).text_size(12).text_color(t.muted)
        .child(svg(`${DIR}/spinner.svg`).size(12).flex_none().text_color(t.working).spin(900))
        .child(div().flex_1().min_w(0).truncate().child(this.jobs.length === 1 ? T()[this.jobs[0].kind === "upload" ? "uploading" : "downloading"](this.jobs[0].name) : T().transferring(this.jobs.length)))));
  }
}
