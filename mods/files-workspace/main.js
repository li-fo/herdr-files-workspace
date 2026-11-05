import { FileSelection, visibleFiles, selectionRoots } from "./file-selection.js";
import { addGitMark, gitMark } from "./git-marks.js";
import { relativePath } from "./paths.js";
// Files Transfer: Herdr's Files panel with VS Code's Material Icon Theme icons and file transfer.
// A lazy file browser for the focused pane's folder, with bounded read-only previews, and a
// right-click menu that downloads, uploads (paste from Finder, or drop), copies paths, creates,
// renames, moves to the Trash (here) or deletes (remote),
// on this computer or on the remote machine the space runs on (over ssh).
//
// Based on File Icons by amster93 (https://github.com/amster93/herdr-file-icons, Apache-2.0),
// itself modified from Herdr's shipped `files` mod (https://github.com/herdrdev/herdr-app,
// Apache-2.0). Added here: the menu, transfers, create/rename/trash/delete, drop, previews,
// English/Russian text.
import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex, Editor, EditorState, TextView, InputState, Input } from "gpui-base";
import { spaces, panes, focused, run, readTextFile, watchFolder, theme, settings, window, props, openOverlay, closeOverlay, shared, setShared, notify, appHome, home } from "herdr";
import { exec, windows, isWindows } from "./windows.js";
import ICONS from "./icons.js";
import { downloadDirectory } from "./download-settings.js";
import { openFile, tabContext } from "./file-tabs.js";
import Document from "./document.js";
import TransferQueue from "./transfer-queue.js";
import { directory, sshTarget } from "./file-operations.js";

// Right-click menu on a file or folder: download it to ~/Downloads (scp from a remote
// machine, cp here), paste files copied in Finder into it (upload), copy its path, show it
// in Finder, delete it after a confirmation. Files dropped from Finder upload too. The menu
// and the confirmation are this mod opened as a popup / dialog (props().menu, .confirm);
// they hand the choice to the panel that opened them through shared "files.request", since
// an overlay's tasks end when it closes and a transfer can take long.
const REQUEST = "files-workspace.request";
const LANG_KEY = "files-workspace.lang";
const MENU_ROW = 31;
// Our temporary folders, never listed in the tree.
const TEMP = /^\.herdr-(upload|download)\./;
// Files copied in Finder (⌘C): their paths, from the general pasteboard.
const CLIPBOARD = `ObjC.import("AppKit");
const urls = $.NSPasteboard.generalPasteboard.readObjectsForClassesOptions($.NSArray.arrayWithObject($.NSURL),
  $.NSDictionary.dictionaryWithObjectForKey(true, "NSPasteboardURLReadingFileURLsOnlyKey"));
const out = [];
if (urls) for (let i = 0; i < urls.count; i++) out.push(urls.objectAtIndex(i).path.js);
JSON.stringify(out);`;

// Interface text: Russian when macOS is set to Russian, else English (see init).
const STRINGS = {
  en: {
    pasteHere: "Paste here", pasteInto: "Paste into this folder", pasteBeside: "Paste here",
    download: "Download to Downloads", downloadFolder: "Download folder to Downloads",
    downloadTo: (folder) => `Download to ${folder}`, chooseDownload: "Download to…",
    copyRelativePath: "Copy Relative Path", copyPath: "Copy path", reveal: "Reveal in Finder", delete: "Delete…",
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
    source: "Source", preview: "Preview", openInPreview: "Open in Preview", loadingImage: "Loading image…",
    imageTooBig: (n) => `Image is too large to preview (${n})`, imageFailed: "Couldn't show this image",
    newFile: "New file…", newFolder: "New folder…", rename: "Rename…", moveToTrash: "Move to Trash",
    newFileTitle: "New file", newFolderTitle: "New folder", renameTitle: (n) => `Rename “${n}”`,
    nameLabel: "Name", create: "Create", save: "Rename", in: (p) => `In ${p}`,
    badName: "Enter a name without “/”", exists: (n) => `“${n}” already exists`,
    created: (n) => `Created ${n}`, renamed: (a, b) => `Renamed ${a} → ${b}`, trashed: (n) => `Moved ${n} to the Trash`,
    createFailed: (n) => `Couldn't create ${n}`, renameFailed: (n) => `Couldn't rename ${n}`, trashFailed: (n) => `Couldn't move ${n} to the Trash`,
    remoteDelete: "This machine has no Trash: it will be deleted permanently.",
  },
  ru: {
    pasteHere: "Вставить сюда", pasteInto: "Вставить в эту папку", pasteBeside: "Вставить рядом",
    download: "Скачать в Загрузки", downloadFolder: "Скачать папку в Загрузки",
    downloadTo: (folder) => `Скачать в ${folder}`, chooseDownload: "Скачать в…",
    copyRelativePath: "Copy Relative Path", copyPath: "Скопировать путь", reveal: "Показать в Finder", delete: "Удалить…",
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
    source: "Код", preview: "Просмотр", openInPreview: "Открыть в Просмотре", loadingImage: "Загружается изображение…",
    imageTooBig: (n) => `Изображение слишком большое для просмотра (${n})`, imageFailed: "Не удалось показать изображение",
    newFile: "Новый файл…", newFolder: "Новая папка…", rename: "Переименовать…", moveToTrash: "В Корзину",
    newFileTitle: "Новый файл", newFolderTitle: "Новая папка", renameTitle: (n) => `Переименовать «${n}»`,
    nameLabel: "Имя", create: "Создать", save: "Переименовать", in: (p) => `В папке ${p}`,
    badName: "Введите имя без «/»", exists: (n) => `«${n}» уже существует`,
    created: (n) => `Создано: ${n}`, renamed: (a, b) => `Переименовано: ${a} → ${b}`, trashed: (n) => `В Корзине: ${n}`,
    createFailed: (n) => `Не удалось создать ${n}`, renameFailed: (n) => `Не удалось переименовать ${n}`, trashFailed: (n) => `Не удалось переместить ${n} в Корзину`,
    remoteDelete: "На этой машине нет Корзины: удаление навсегда.",
  },
};
const T = () => {
  const t = STRINGS[shared(LANG_KEY)] ?? STRINGS.en;
  return isWindows() ? { ...t, reveal: "Show in File Explorer", moveToTrash: "Move to Recycle Bin",
    openInPreview: "Open in default app", nothingToPasteBody: "Copy files in File Explorer (Ctrl+C), then paste here (Ctrl+V).",
    badName: "Enter a valid file name (no reserved names or path characters)." } : t;
};

// Previews: Markdown is drawn formatted (with a Source toggle); images are copied into the
// app folder first, because image() only reads from there, and the formats GPUI can't draw
// are turned into PNG with sips.
const MARKDOWN = /\.(md|markdown|mdx)$/i;
const IMAGE = /\.(png|jpe?g|gif|webp|bmp|svg|ico|tiff?|heic|heif|avif)$/i;
const CONVERT = /\.(ico|tiff?|heic|heif|avif)$/i;
const PREVIEW_DIR = "data/files-workspace/preview";
const MAX_IMAGE = 50 * 1024 * 1024;
// Preview Plus (linziyanleo/herdr-mods), when the layout pairs it with this panel in a stack
// (this block's props.previewStack names the stack, its child "preview-plus" shows the file):
// Markdown, PNG/JPEG/WebP/SVG images and PDFs open there. It reads media only from this
// computer, so a remote image or PDF is copied here first. Everything else stays in this panel.
const PP_TARGET = "preview-plus.target";
const PP_MARKDOWN = /\.(md|markdown)$/i;
const PP_MEDIA = /\.(png|jpe?g|webp|svg|pdf)$/i;
const bytesText = (n) => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`;

const parentOf = path => {
  const normalized = path.replaceAll("\\", "/");
  const parent = normalized.slice(0, normalized.lastIndexOf("/")) || "/";
  return /^[A-Za-z]:$/.test(parent) ? parent + "/" : parent;
};

// A menu row is [action, label, icon]; null draws a divider.
const MENU = (target, t = T()) => target.items?.length > 1
  ? [["open-selected", "Open selected files", "file-plus.svg"],
     ["download", "Download selected items", "download.svg"],
     ["copy", "Copy Paths", "copy.svg"], ["copy-relative", "Copy Relative Paths", "copy.svg"], null,
     ["delete", target.on ? "Delete selected items…" : "Move selected items to Recycle Bin…", "trash.svg"]]
  : target.newOnly
  ? [["new-file", t.newFile, "file-plus.svg"], ["new-folder", t.newFolder, "folder-plus.svg"]]
  : target.root
  ? [["paste", t.pasteHere, "paste.svg"], ["copy", t.copyPath, "copy.svg"], ["copy-relative", t.copyRelativePath, "copy.svg"], null,
     ["new-file", t.newFile, "file-plus.svg"], ["new-folder", t.newFolder, "folder-plus.svg"]]
  : [
      ["download", downloadDirectory() ? t.downloadTo(downloadDirectory()) : target.dir ? t.downloadFolder : t.download, "download.svg"],
      ["download-to", t.chooseDownload, "folder-plus.svg"],
      ...(!target.dir && target.previewStack && (PP_MARKDOWN.test(target.path) || PP_MEDIA.test(target.path)) ? [["preview-plus", "Open in Preview Plus", "file-plus.svg"]] : []),
      ["paste", target.dir ? t.pasteInto : t.pasteBeside, "paste.svg"],
      ["copy", t.copyPath, "copy.svg"], ["copy-relative", t.copyRelativePath, "copy.svg"],
      ...(target.on ? [] : [["reveal", t.reveal, "finder.svg"]]),
      null,
      ["new-file", t.newFile, "file-plus.svg"],
      ["new-folder", t.newFolder, "folder-plus.svg"],
      ["rename", t.rename, "pen.svg"],
      null,
      // Here: the Trash (Put Back works); another machine has none, so it asks and deletes.
      target.on ? ["delete", t.delete, "trash.svg"] : ["trash", t.moveToTrash, "trash.svg"],
    ];
// A name typed for a new entry or a rename: one path component.
const validName = (n, on) => n !== "" && n !== "." && n !== ".." && !/[\/\u0000-\u001f]/.test(n)
  && (on || !isWindows() || (!/[<>:"\\|?*]/.test(n) && !/[. ]$/.test(n) && !/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(n)));
// Run on the entry's machine. Each refuses to replace what is there (exit 17).
const MAKE_FILE = 'set -C; [ -e "$1" ] || [ -L "$1" ] && exit 17; : > "$1"';
const MAKE_FOLDER = '[ -e "$1" ] || [ -L "$1" ] && exit 17; mkdir -- "$1"';
const MOVE = '[ -e "$2" ] || [ -L "$2" ] && exit 17; mv -- "$1" "$2"';
const menuHeight = list => list.reduce((h, it) => h + (it ? MENU_ROW : 9), 10);

// The sidebar follows terminal navigation, not the parent directory of an editor.
const browseLocations = new Map();
function location() {
  if (props()?.viewer) return { cwd: props().viewer.root, on: props().viewer.on };
  const space = spaces().find(s => s.active), f = focused();
  const pane = f?.pane ? panes().find(p => p.pane === f.pane) : null;
  const fileTab = tabContext(f?.tab, space?.id);
  if (fileTab) {
    const previous = browseLocations.get(space?.id);
    if (previous && previous.on === fileTab.on) return previous;
    const current = { cwd: fileTab.root, on: fileTab.on };
    browseLocations.set(space?.id, current);
    return current;
  }
  const on = f?.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : space?.machine ?? null;
  const cwd = pane?.cwd || f?.cwd || space?.folder;
  const current = { cwd: !on && isWindows() ? cwd?.replaceAll("\\", "/") : cwd, on };
  // A shell cd into docs/tmp must not shrink an already broader project tree.
  const previous = browseLocations.get(space?.id);
  const base = previous?.on === on ? previous.cwd : space?.folder?.replaceAll("\\", "/");
  const normalize = path => !on && isWindows() ? path?.toLowerCase() : path;
  if (base && current.cwd && (normalize(current.cwd) === normalize(base)
    || normalize(current.cwd).startsWith(normalize(base).replace(/\/$/, "") + "/"))) current.cwd = base;
  if (current.cwd && space?.id) browseLocations.set(space.id, current);
  return current;
}
const key = () => JSON.stringify(location());
const LANG = { ts: "js", tsx: "js", mts: "js", cts: "js", jsx: "js", mjs: "js", toml: "yaml", jsonc: "json", svelte: "html", vue: "html" };
const PER_FOLDER = 500, TOTAL = 5000;
const DIR = "mods/files-workspace";

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

export default class Files extends View {
  init(_props, cx) {
    if (props()?.document) { this.document = new Document(); return this.document.init(props().document, cx); }
    if (props()?.ask) return this.initAsk(cx);
    if (props()?.menu || props()?.confirm) { this.at = 0; this.handle = cx.focus_handle(); this.handle.focus(); return; }
    // Which panel a menu choice is for: the one that opened the menu.
    this.me = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    this.transfers = new TransferQueue(T, cx => this.refresh(cx));
    // ⌘V pastes into the selected row's folder: the panel takes the keyboard when clicked.
    this.keys = cx.focus_handle();
    if (props()?.viewer) {
      const info = props().viewer;
      this.context = key(); this.root = info.root; this.projectRoot = info.projectRoot || info.root; this.on = info.on;
      this.show(info.file.slice(this.root.length + 1), cx);
      return; // Image tabs do not browse folders, watch them, or poll Git/transfers.
    }
    exec("sh", ["-c", 'mkdir -p "$1" && find "$1" -mindepth 1 -mmin +60 -delete', "clean", `${appHome()}/${PREVIEW_DIR}`]).catch(() => {});
    this.selection = new FileSelection();
    this.selected = null; // { path, dir } inside the shown folder
    cx.spawn(async cx => {
      const r = await exec("defaults", ["read", "-g", "AppleLanguages"]).catch(() => null);
      const lang = /^\W*"?ru/m.test(r?.stdout?.split("\n").find(l => /\w/.test(l) && !/^\s*\(/.test(l)) ?? "") ? "ru" : "en";
      if (shared(LANG_KEY) !== lang) setShared(LANG_KEY, lang);
    });
    cx.timer.every(1000, cx => this.poll(cx));
    this.treeStates = new Map();
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
    for (const previous of this.entries.get(path) || []) {
      if (!entries.some(entry => entry.name === previous.name && entry.dir === previous.dir)) this.selection?.remove(path ? `${path}/${previous.name}` : previous.name);
    }
    if (this.selection && this.selected && !this.selection.items.has(this.selected.path)) this.selected = [...this.selection.items.values()].at(-1) || null;
    const used = [...this.entries.entries()].filter(([p]) => p !== path).reduce((n, [, e]) => n + e.length, 0);
    this.entries.set(path, entries.slice(0, Math.max(0, Math.min(PER_FOLDER, TOTAL - used))).sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name)));
    if (entries.length > PER_FOLDER || used + entries.length > TOTAL) this.limited = true;
  }

  refresh(cx) {
    if (this.loading) return;
    const { cwd, on } = location(), context = key();
    if (context !== this.context) {
      if (this.context) this.treeStates.set(this.context, { folders: new Set(this.folders), selected: this.selected, selection: this.selection });
      const saved = this.treeStates.get(context);
      this.context = context; this.projectRoot = null; this.root = cwd; this.on = on; this.entries = new Map(); this.folders = saved?.folders || new Set();
      this.pending = new Set(); this.marks = {}; this.selected = saved?.selected || null; this.selection = saved?.selection || new FileSelection(this.selected ? [this.selected] : []); this.show(null); this.watched = null; this.error = null; this.limited = false;
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
            addGitMark(marks, `${top.stdout.trim()}/${entry.slice(3)}`, xy === "??" || xy.includes("A") ? "A" : xy.includes("U") ? "U" : xy.includes("D") ? "D" : "M", cwd);
          }
        }
        if (key() !== context) return;
        this.projectRoot = top?.code === 0 ? top.stdout.trim() : cwd;
        this.marks = marks; this.error = null; this.watch(cwd, cx);
      } catch (e) { if (key() === context) this.error = String(e); }
      finally { this.loading = false; cx.notify(); }
    });
  }

  toggle(path, cx) {
    if (this.folders.has(path)) {
      for (const selected of this.selection?.items.keys() || []) if (selected.startsWith(path + "/")) this.selection.remove(selected);
      if (this.selected?.path.startsWith(path + "/")) this.selected = [...this.selection.items.values()].at(-1) || null;
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
    this.md = null; this.source = false;
    if (this.img) { exec("rm", ["-rf", parentOf(this.img.abs)]).catch(() => {}); this.img = null; }
    if (!path || !cx) return;
    if (IMAGE.test(path)) return this.showImage(path, cx);
    const context = this.context, root = this.root, on = this.on;
    cx.spawn(async cx => {
      try {
        const text = await readTextFile(`${root}/${path}`, { on });
        if (this.file !== path || key() !== context) return;
        if (text === null) { this.fileError = "This file is no longer available"; return; }
        if (text.includes("\0")) { this.fileError = "Binary file · no text preview"; return; }
        if (MARKDOWN.test(path)) this.md = text.length > 400000 ? text.slice(0, 400000) : text;
        const t = theme(), ext = path.includes(".") ? path.split(".").pop() : "txt";
        this.code = EditorState.new({ language: LANG[ext] ?? ext, readonly: true,
          value: text.length > 400000 ? text.slice(0, 400000) + "\n… (file truncated)" : text,
          font_family: settings().font_family, font_size: 12,
          syntax: { keyword: t.ansi5, string: t.ansi2, comment: t.dim, function: t.ansi4, type: t.ansi3, number: t.ansi1, constant: t.ansi6 } });
      } catch { if (this.file === path && key() === context) this.fileError = "Cannot preview this file (binary, too large, or unreadable)"; }
      finally { cx.notify(); }
    });
  }

  // A copy of src (on machine `on`) in this mod's preview folder, here; its absolute path.
  async stage(src, on) {
    const size = await exec("sh", ["-c", 'wc -c < "$1"', "size", src], { on });
    if (size.code !== 0) throw new Error((size.stderr || T().imageFailed).trim());
    const bytes = Number(size.stdout.trim());
    if (bytes > MAX_IMAGE) throw new Error(T().imageTooBig(bytesText(bytes)));
    const dir = `${appHome()}/${PREVIEW_DIR}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    await exec("mkdir", ["-p", dir]);
    const file = `${dir}/${src.split("/").pop()}`;
    const copy = on
      ? await exec("scp", ["-p", "-o", "BatchMode=yes", "-o", "ConnectTimeout=15", `${await sshTarget(on)}:${src}`, file])
      : await exec("cp", [src, file]);
    if (copy.code !== 0) { await exec("rm", ["-rf", dir]).catch(() => {}); throw new Error((copy.stderr || T().imageFailed).trim()); }
    return { file, bytes };
  }

  // Shows the file in the paired Preview Plus; false when it isn't paired or isn't for it.
  handoff(path, cx) {
    const stack = props()?.previewStack, markdown = PP_MARKDOWN.test(path);
    if (!stack || (!markdown && !PP_MEDIA.test(path))) return false;
    const abs = `${this.root}/${path}`, on = this.on ?? null, root = this.root;
    const go = (target) => {
      const f = focused(), space = f?.space ?? spaces().find(s => s.active)?.id;
      if (!space) return;
      setShared(PP_TARGET, { ...(shared(PP_TARGET) ?? {}), [space]: target });
      run("layout.select", { stack, child: "preview-plus" });
    };
    if (markdown || !on) { go({ file: abs, root, on: markdown ? on : null }); return true; }
    cx.spawn(async () => {
      try { const { file } = await this.stage(abs, on); go({ file, root: parentOf(file), on: null }); }
      catch (e) { notify({ title: T().imageFailed, body: String(e.message ?? e), level: "error" }); }
    });
    return true;
  }

  // An image: copied into the app folder (scp from a remote machine), converted when GPUI
  // can't draw its format, measured with sips, then drawn fitted to the panel.
  showImage(path, cx) {
    const context = this.context, root = this.root, on = this.on ?? null, src = `${root}/${path}`;
    const ext = path.split(".").pop().toLowerCase(), id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    cx.spawn(async cx => {
      let file = null;
      try {
        if (!on && isWindows()) {
          const prepared = await windows("prepare-image", [src, MAX_IMAGE, CONVERT.test(path)]);
          if (prepared.code !== 0) throw new Error(prepared.stderr || T().imageFailed);
          const result = JSON.parse(prepared.stdout);
          file = result.file;
          if (this.closed || this.file !== path || key() !== context) { await exec("rm", ["-rf", parentOf(file)]); return; }
          this.img = { rel: file.slice(appHome().length + 1), abs: file, local: src, w: result.w, h: result.h, bytes: result.bytes };
          return;
        }
        const staged = await this.stage(src, on), dir = parentOf(staged.file), bytes = staged.bytes;
        file = `${dir}/${id}.${ext}`;
        await exec("mv", [staged.file, file]);
        if (CONVERT.test(path)) {
          const png = `${dir}/${id}.png`;
          const c = await exec("sips", ["-s", "format", "png", file, "--out", png]);
          await exec("rm", ["-f", file]);
          file = png;
          if (c.code !== 0) throw new Error(T().imageFailed);
        }
        let w = null, h = null;
        if (ext !== "svg") {
          const d = await exec("sips", ["-g", "pixelWidth", "-g", "pixelHeight", file]);
          w = Number(d.stdout.match(/pixelWidth:\s*(\d+)/)?.[1]) || null;
          h = Number(d.stdout.match(/pixelHeight:\s*(\d+)/)?.[1]) || null;
        }
        if (this.closed || this.file !== path || key() !== context) { await exec("rm", ["-rf", parentOf(file)]); return; }
        this.img = { rel: file.slice(appHome().length + 1), abs: file, local: on ? null : src, w, h, bytes };
      } catch (e) {
        if (file) exec("rm", ["-rf", parentOf(file)]).catch(() => {});
        if (this.file === path && key() === context) this.fileError = String(e.message ?? e);
      } finally { if (!this.closed) cx.notify(); }
    });
  }

  // What an open file shows: an image, formatted Markdown, or the read-only code view.
  preview(t) {
    const img = this.img;
    if (img) {
      const room = { w: (this.size?.width ?? 360) - 32, h: (this.size?.height ?? 480) - 42 - 34 - 32 - (this.jobs.length ? 30 : 0) };
      const k = img.w && img.h ? Math.min(1, room.w / img.w, room.h / img.h) : null;
      const info = [img.w && `${img.w}×${img.h}`, bytesText(img.bytes), k !== null && k < 1 && `${Math.round(k * 100)}%`].filter(Boolean).join(" · ");
      return v_flex().flex_1().min_h(0)
        .child(div().id("files-image").flex_1().min_h(0).p(16).flex().items_center().justify_center().overflow_hidden().bg(t.canvas)
          .child(k !== null ? image(img.rel).w(Math.max(1, img.w * k)).h(Math.max(1, img.h * k)) : image(img.rel).size_full()))
        .child(h_flex().h(34).flex_none().px(14).gap(8).items_center().border_t(1).border_color(t.border).text_size(12).text_color(t.dim)
          .child(div().flex_1().min_w(0).truncate().child(info))
          .child(div().id("files-open-preview").px(8).py(3).rounded(6).cursor_pointer().text_color(t.muted)
            .hover(s => s.bg(t.hover).text_color(t.foreground))
            .on_click(() => exec("open", ["-a", "Preview", img.local ?? img.abs]).catch(() => {}))
            .child(T().openInPreview)));
    }
    if (this.md !== null && !this.source) {
      return div().id("files-md").flex_1().min_h(0).overflow_y_scrollbar().px(18).py(14).text_size(13.5)
        .child(TextView.markdown(`md-${this.file}`, this.md).selectable(true));
    }
    if (this.code) return Editor.new(this.code).flex_1().min_h(0);
    return div().p(12).text_color(t.dim).child(this.fileError || (IMAGE.test(this.file) ? T().loadingImage : "Loading file…"));
  }

  // path: inside the shown folder ("" for the folder itself).
  openMenu(path, dir) {
    const target = path
      ? { path: `${this.root}/${path}`, name: path.split("/").pop(), dir, on: this.on ?? null, from: this.me }
      : { path: this.root, name: this.root.split("/").pop(), dir: true, root: true, on: this.on ?? null, from: this.me };
    if (path && this.selection?.items.has(path) && this.selection.items.size > 1) {
      target.items = this.selectedItems(); target.rootPath = this.root;
    }
    target.relativePath = relativePath(target.path, this.projectRoot || this.root, !this.on && isWindows());
    target.previewStack = props()?.previewStack;
    openOverlay({ mod: "files-workspace", kind: "popup", width: downloadDirectory() ? 460 : 250, height: menuHeight(MENU(target)), props: { menu: target } });
  }

  // A choice made in the menu or the confirmation, for this panel.
  take(cx) {
    const req = shared(REQUEST);
    if (!req || req.from !== this.me || req.id === this.lastRequest) return;
    this.lastRequest = req.id;
    setShared(REQUEST, null);
    if (req.items?.length > 1) { this.takeSelection(req, cx); return; }
    const { action, path, name, dir, on } = req;
    if (action === "preview-plus") { this.handoff(path.slice(this.root.length + 1), cx); return; }
    if (action === "delete") {
      openOverlay({ mod: "files-workspace", kind: "dialog", width: 420, height: 176, props: { confirm: { path, name, dir, on, from: this.me } } });
      return;
    }
    if (action === "new-file" || action === "new-folder" || action === "rename") {
      // New entries go into the folder clicked, or beside the file clicked.
      const folder = action === "rename" ? parentOf(path) : dir ? path : parentOf(path);
      openOverlay({ mod: "files-workspace", kind: "dialog", width: 440, height: 214,
        props: { ask: { kind: action, folder, path, name, dir, on, from: this.me } } });
      return;
    }
    cx.spawn(async cx => {
      try {
        if (action === "copy" || action === "copy-relative") {
          const copiedPath = action === "copy-relative" ? req.relativePath : path;
          const r = await exec("sh", ["-c", 'printf %s "$1" | pbcopy', "copy", copiedPath]);
          if (r.code !== 0) throw new Error(r.stderr || "Cannot copy the path");
          notify({ title: T().pathCopied, body: copiedPath, level: "info", timeout: 2500 });
        } else if (action === "reveal") {
          const r = await exec("open", ["-R", path]);
          if (r.code !== 0) throw new Error(r.stderr || "Cannot reveal this item");
        } else if (action === "download" || action === "download-to") {
          await this.download(path, name, dir, on, action === "download-to");
        } else if (action === "paste") {
          await this.paste(dir ? path : parentOf(path), on);
        } else if (action === "trash") {
          if (on || path === this.root || path.split("/").filter(Boolean).length < 2) throw new Error(T().tooDangerous(path));
          const r = await exec("trash", [path]);
          if (r.code !== 0) throw new Error((r.stderr || `exit ${r.code}`).trim());
          notify({ title: T().trashed(name), body: path.replace(home(), "~"), level: "success", timeout: 4000 });
          if (this.file && `${this.root}/${this.file}`.startsWith(path)) this.show(null);
          this.refresh(cx);
        } else if (action === "create-file" || action === "create-folder") {
          const target = `${req.folder}/${req.value}`;
          const r = await exec("sh", ["-c", action === "create-file" ? MAKE_FILE : MAKE_FOLDER, "make", target], { on });
          if (r.code === 17) throw new Error(T().exists(req.value));
          if (r.code !== 0) throw new Error((r.stderr || `exit ${r.code}`).trim());
          notify({ title: T().created(req.value), body: on ? `${on}:${target}` : target.replace(home(), "~"), level: "success", timeout: 3000 });
          this.reveal(target, action === "create-folder");
          this.refresh(cx);
        } else if (action === "rename-yes") {
          const target = `${parentOf(path)}/${req.value}`;
          if (target === path) return;
          const r = await exec("sh", ["-c", MOVE, "move", path, target], { on });
          if (r.code === 17) throw new Error(T().exists(req.value));
          if (r.code !== 0) throw new Error((r.stderr || `exit ${r.code}`).trim());
          notify({ title: T().renamed(name, req.value), body: on ? `${on}:${target}` : target.replace(home(), "~"), level: "success", timeout: 3000 });
          if (this.file && `${this.root}/${this.file}` === path) this.show(null);
          this.reveal(target, dir);
          this.refresh(cx);
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
        const what = { download: T().downloadFailed(name), "download-to": T().downloadFailed(name), paste: T().uploadFailed(), "delete-yes": T().deleteFailed(name),
          trash: T().trashFailed(name), "create-file": T().createFailed(req.value), "create-folder": T().createFailed(req.value),
          "rename-yes": T().renameFailed(name) }[action] ?? T().failed;
        notify({ title: what, body: String(e.message ?? e), level: "error" });
      }
      cx.notify();
    });
  }

  takeSelection(req, cx) {
    if (this.batchBusy || req.rootPath !== this.root || (req.on || null) !== (this.on || null)) return;
    const items = req.items.filter(item => item.path && !item.path.startsWith("/") && !item.path.includes("\\")
      && !item.path.split("/").some(part => part === "." || part === ".." || !part));
    if (items.length !== req.items.length) return;
    if (req.action === "delete") {
      openOverlay({mod: "files-workspace", kind: "dialog", width: 480, height: 210,
        props: {confirm: {...req, name: `${items.length} selected items`, path: req.rootPath, dir: items.some(item => item.dir)}}});
      return;
    }
    if (req.action === "open-selected") {
      for (const item of items) if (!item.dir) this.openTab(item.path, cx);
      return;
    }
    const root = req.rootPath, on = req.on || null, projectRoot = this.projectRoot || root;
    this.batchBusy = true;
    cx.spawn(async cx => {
      let completed = 0;
      try {
        if (req.action === "copy" || req.action === "copy-relative") {
          const text = items.map(item => req.action === "copy" ? `${root}/${item.path}` : relativePath(`${root}/${item.path}`, projectRoot, !on && isWindows())).join("\n");
          cx.write_to_clipboard(text);
          notify({title: T().pathCopied, body: `${items.length} paths`, level: "info"});
        } else if (req.action === "download" || req.action === "delete-yes") {
          for (const item of selectionRoots(items)) {
            const path = `${root}/${item.path}`;
            if (req.action === "download") await this.download(path, item.path.split("/").pop(), item.dir, on);
            else {
              const result = on ? await exec("rm", ["-rf", "--", path], {on}) : await exec("trash", [path]);
              if (result.code !== 0) throw new Error(result.stderr || `Cannot delete ${path}`);
              if (this.root === root && (this.on || null) === on) {
                this.selection.remove(item.path);
                this.selected = [...this.selection.items.values()].at(-1) || null;
              }
            }
            completed++;
          }
          notify({title: req.action === "download" ? "Downloads started" : "Selected items removed", body: `${completed} items`, level: "success"});
        }
      } catch (error) {
        notify({title: T().failed, body: `${completed} items completed. ${String(error.message || error)}`, level: "error"});
      } finally {
        this.batchBusy = false;
        if (req.action === "delete-yes" && this.root === root && (this.on || null) === on) this.refresh(cx);
        cx.notify();
      }
    });
  }

  // Files copied in Finder, uploaded into folder (absolute, on the machine `on`).
  async paste(folder, on) {
    const r = await exec("osascript", ["-l", "JavaScript", "-e", CLIPBOARD]);
    if (r.code !== 0) throw new Error(r.stderr || "Cannot read the file clipboard");
    const files = r.code === 0 ? JSON.parse(r.stdout.trim() || "[]") : [];
    if (!files.length) return notify({ title: T().nothingToPaste, body: T().nothingToPasteBody, level: "warning", timeout: 5000 });
    await this.upload(files, folder, on);
  }

  // ⌘V: into the selected folder, beside the selected file, else into the shown folder.
  pasteKey(cx) {
    if (!this.root) return;
    if (this.selection?.items.size > 1) return;
    const sel = this.selected;
    const folder = !sel ? this.root : sel.dir ? `${this.root}/${sel.path}` : parentOf(`${this.root}/${sel.path}`);
    const on = this.on ?? null;
    cx.spawn(async cx => {
      try { await this.paste(folder, on); }
      catch (e) { notify({ title: T().uploadFailed(), body: String(e.message ?? e), level: "error" }); }
      cx.notify();
    });
  }

  // A new or renamed entry: its folders open in the tree and it is selected.
  reveal(abs, dir) {
    if (!abs.startsWith(`${this.root}/`)) return;
    const rel = abs.slice(this.root.length + 1), parts = rel.split("/");
    for (let i = 1; i < parts.length; i++) this.folders.add(parts.slice(0, i).join("/"));
    this.select(rel, dir);
  }

  get jobs() { return this.transfers?.jobs || []; }
  download(...args) { return this.transfers.download(...args); }
  upload(...args) { return this.transfers.upload(...args); }
  poll(cx) { this.transfers?.poll(cx); }

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

  // A name for a new file or folder, or a new name: Enter creates or renames, Esc cancels.
  initAsk(cx) {
    const a = props().ask, value = a.kind === "rename" ? a.name : "";
    this.text = value; this.askError = null;
    this.input = InputState.new({ value });
    // Renaming a file selects its name without the extension, as Finder does.
    const dot = a.kind === "rename" && !a.dir ? value.lastIndexOf(".") : -1;
    if (value) this.input.set_selected_range({ start: 0, end: dot > 0 ? dot : value.length });
    this.input.on("change", (_e, cx) => { this.text = this.input.value(); this.askError = null; cx.notify(); });
    this.input.on("submit", (_e, cx) => { this.submitAsk(); cx.notify(); });
    this.input.focus();
    cx.timer.after(400, () => this.input.focus());
    this.handle = cx.focus_handle();
  }

  submitAsk() {
    const a = props().ask, value = this.text.trim();
    if (!validName(value, a.on)) { this.askError = T().badName; return; }
    const action = { "new-file": "create-file", "new-folder": "create-folder", rename: "rename-yes" }[a.kind];
    setShared(REQUEST, { id: `${Date.now()}-${Math.random()}`, action, ...a, value });
    closeOverlay(props().overlay);
  }

  ask(t) {
    const a = props().ask;
    const title = a.kind === "rename" ? T().renameTitle(a.name) : a.kind === "new-file" ? T().newFileTitle : T().newFolderTitle;
    const where = a.on ? `${a.on}:${a.folder}` : a.folder.replace(home(), "~");
    const button = (id, label, primary, act) => h_flex().id(id).h(32).px(14).items_center().rounded(8).border_1()
      .border_color(primary ? t.solid : t.input).bg(primary ? t.solid : t.raised).text_color(primary ? t.solid_foreground : t.foreground)
      .text_size(12.5).cursor_pointer().hover(s => s.opacity(0.88)).on_click(act).child(label);
    return v_flex().id("files-ask").track_focus(this.handle).size_full().min_h(0).p(18).bg(t.popover).text_color(t.foreground)
      .on_key_down((e, cx) => { if (e.key === "escape") { closeOverlay(props().overlay); cx.stop_propagation(); } })
      .child(div().text_size(14).font_semibold().truncate().child(title))
      .child(div().pt(4).text_size(12).text_color(t.dim).truncate().child(T().in(where)))
      .child(div().pt(14).pb(6).text_size(11.5).text_color(t.dim).child(T().nameLabel))
      .child(Input.new(this.input).h(36).px(10).rounded(9).border_1().border_color(this.askError ? t.ansi1 : t.accent).bg(t.background).text_size(12.8).text_color(t.foreground))
      .child(div().h(18).pt(4).text_size(11.5).text_color(t.ansi1).child(this.askError ?? ""))
      .child(h_flex().flex_1().items_end().justify_end().gap(8)
        .child(button("ask-cancel", T().cancel, false, () => closeOverlay(props().overlay)))
        .child(button("ask-ok", a.kind === "rename" ? T().save : T().create, true, (_e, cx) => { this.submitAsk(); cx.notify(); })));
  }

  // "Delete …?" with the path and the machine; Enter deletes, Esc cancels.
  confirm(t) {
    const c = props().confirm;
    const yes = () => {
      setShared(REQUEST, { ...c, id: `${Date.now()}-${Math.random()}`, action: "delete-yes" });
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
      .child(div().text_size(12).text_color(t.muted).truncate().child(c.items ? c.items.map(item => item.path).join(", ") : c.on ? `${c.on}:${c.path}` : c.path))
      .child(div().text_size(12).text_color(t.dim).child(c.items && !c.on ? "Move selected items to the Recycle Bin. Selected folders include their contents." : `${c.on ? `${T().remoteDelete} ` : ""}${T().deleteDetail(c.dir)}`))
      .child(h_flex().flex_1().items_end().justify_end().gap(8)
        .child(button("no", T().cancel, t.popover, t.foreground, t.input, () => closeOverlay(props().overlay)))
        .child(button("yes", T().confirmDelete, t.ansi1, t.background, t.ansi1, yes)));
  }

  selectedItems() {
    return visibleFiles(this.entries, this.folders).filter(item => this.selection?.items.has(item.path));
  }

  clearSelection() { this.selection?.clear(); this.selected = null; }

  select(path, dir, modifiers = {}) {
    this.selection ||= new FileSelection();
    this.selected = this.selection.click({path, dir}, visibleFiles(this.entries, this.folders), modifiers);
    this.keys?.focus();
  }

  openTab(path, cx) {
    if (/\.pdf$/i.test(path)) {
      if (!this.handoff(path, cx)) notify({ title: "PDF preview unavailable", body: "Configure Preview Plus, or download the PDF and open it in your PDF viewer.", level: "info" });
      return;
    }
    const space = spaces().find(s => s.active)?.id;
    if (!space) return;
    const info = { space, root: this.root, projectRoot: this.projectRoot || this.root, on: this.on || null, file: `${this.root}/${path}` };
    cx.spawn(async () => {
      try { await openFile(info); }
      catch (error) { notify({ title: "Cannot open file", body: String(error.message || error), level: "error" }); }
    });
  }

  close() { this.closed = true; this.document?.close(); if (this.img) exec("rm", ["-rf", parentOf(this.img.abs)]).catch(() => {}); }

  rows(prefix, depth, out, t, dark) {
    if (out.length >= TOTAL || depth > 40) return out;
    for (const entry of this.entries.get(prefix) ?? []) {
      if (out.length >= TOTAL) break;
      const path = prefix ? `${prefix}/${entry.name}` : entry.name, open = this.folders.has(path), mark = gitMark(this.marks, `${this.root}/${path}`);
      const markColor = mark === "A" ? t.ansi2 : mark === "D" || mark === "U" ? t.ansi1 : mark === "M" ? t.ansi3 : t.foreground;
      out.push(h_flex().id(`file-${path}`).h(28).flex_none().pl(8 + depth * 18).pr(8).gap(7).items_center().rounded(7).cursor_pointer()
        .when(Boolean(this.selection?.items.has(path)), el => el.bg(t.selected)).hover(s => s.bg(t.hover))
        .on_mouse_down("left", (_e, cx) => { cx.stop_propagation(); })
        .on_click((e, cx) => {
          cx.stop_propagation(); this.select(path, entry.dir, e.modifiers); cx.notify();
          if (!e.modifiers?.shift && !e.modifiers?.control && !e.modifiers?.platform) entry.dir ? this.toggle(path, cx) : this.openTab(path, cx);
        })
        .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); if (!this.selection?.items.has(path)) this.select(path, entry.dir); cx.notify(); this.openMenu(path, entry.dir); })
        .on_drop((e, cx) => { cx.stop_propagation(); this.drop(e.paths, entry.dir ? path : prefix, cx); })
        .child(entry.dir ? svg(`${DIR}/chevron-${open ? "down" : "right"}.svg`).size(12).flex_none().text_color(t.dim) : div().w(12).flex_none())
        .child(image(icon(path, entry.dir, open, dark)).size(16).flex_none())
        .child(div().flex_1().min_w(0).truncate().text_color(markColor).child(entry.name))
        .when(Boolean(mark), el => el.child(div().text_size(11).text_color(markColor).child(mark))));
      if (entry.dir && open) this.rows(path, depth + 1, out, t, dark);
    }
    return out;
  }

  toolbar(action, cx) {
    if (!this.root) return;
    if (action === "reload") { this.refresh(cx); return; }
    const items = this.selectedItems();
    if (items.length > 1) {
      if (action === "delete") this.takeSelection({action: "delete", items, rootPath: this.root, on: this.on || null, from: this.me}, cx);
      return;
    }
    const selected = this.selected;
    const target = { path: selected ? `${this.root}/${selected.path}` : this.root,
      name: selected ? selected.path.split("/").pop() : "", dir: selected ? selected.dir : true,
      on: this.on ?? null, from: this.me };
    if (action === "new") {
      target.newOnly = true;
      openOverlay({ mod: "files-workspace", kind: "popup", width: 220,
        height: menuHeight(MENU(target)), props: { menu: target } });
    } else if (action === "delete" && selected) {
      setShared(REQUEST, { ...target, action: target.on ? "delete" : "trash", id: `${Date.now()}-${Math.random()}` });
      this.take(cx);
    }
  }

  render(cx) {
    if (this.document) return this.document.render(cx);
    if (props()?.menu) return this.menu(theme());
    if (props()?.confirm) return this.confirm(theme());
    if (props()?.ask) return this.ask(theme());
    this.take(cx);
    if (key() !== this.context) this.refresh(cx);
    const t = theme(), dark = Boolean(settings().dark);
    const tool = (action, label, enabled) => div().id(`files-tool-${action}`).flex_none().px(5).py(3).rounded(4)
      .text_size(11).text_color(enabled ? t.foreground : t.dim)
      .when(enabled, el => el.cursor_pointer().hover(s => s.bg(t.hover)))
      .on_click((_e, cx) => { cx.stop_propagation(); if (enabled) this.toolbar(action, cx); }).child(label);
    return v_flex().id("files").track_focus(this.keys).size_full().min_h(0)
      .on_key_down((e, cx) => {
        if (!props()?.viewer && e.keystroke === (isWindows() ? "ctrl-v" : "cmd-v")) { cx.stop_propagation(); this.pasteKey(cx); }
        else if (e.keystroke === "escape" && this.selected) { cx.stop_propagation(); this.clearSelection(); cx.notify(); }
      })
      // Sizes arrive in window points; element sizes are given at zoom 1.
      .on_size_change((size, cx) => {
        const z = settings().zoom || 1, w = size.width / z, h = size.height / z;
        if (w !== this.size?.width || h !== this.size?.height) { this.size = { width: w, height: h }; cx.notify(); }
      })
      .rounded(10).overflow_hidden().bg(t.background).border_1().border_color(t.border).text_color(t.foreground).text_size(13)
      .child(h_flex().h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
        .when(Boolean(this.file) && !props()?.viewer, el => el.child(div().id("files-back").w(20).cursor_pointer().text_color(t.muted).on_click((_e, cx) => { this.show(null); cx.notify(); }).child("←")))
        .child(h_flex().flex_1().min_w(0).gap(6).items_center().text_size(12).text_color(t.dim)
          .when(Boolean(this.file), el => el.child(image(icon(this.file, false, false, dark)).size(14).flex_none()))
          .child(div().min_w(0).truncate().child(this.file ? relativePath(`${this.root}/${this.file}`, this.projectRoot || this.root, !this.on && isWindows()) : (this.root ? this.root.replaceAll("\\", "/").replace(/\/$/, "").split("/").pop() || "/" : "")))
          .when(this.md !== null && Boolean(this.file), el => el.child(div().id("files-md-toggle").flex_none().px(8).py(2).ml(4).rounded(6).border_1().border_color(t.border)
            .cursor_pointer().text_color(t.muted).hover(s => s.bg(t.hover).text_color(t.foreground))
            .on_click((_e, cx) => { this.source = !this.source; cx.notify(); })
            .child(this.source ? T().preview : T().source))))
         .when(!this.file, el => el
          .when((this.selection?.items.size || 0) > 1, el => el.child(div().text_size(11).text_color(t.muted).child(`${this.selection.items.size} selected`)))
          .child(tool("new", "New", Boolean(this.root) && (this.selection?.items.size || 0) < 2))
          .child(tool("delete", "Delete", Boolean(this.root && this.selected)))
          .child(tool("reload", "Reload", Boolean(this.root) && !this.loading))))
      .when(!this.file, el => el.child(v_flex().id("files-tree").flex_1().min_h(0).overflow_y_scrollbar().p(6)
        .on_mouse_down("left", (_e, cx) => { this.clearSelection(); this.keys.focus(); cx.notify(); })
        .on_mouse_down("right", () => this.root && this.openMenu("", true))
        .on_drop((e, cx) => this.drop(e.paths, "", cx)).children(this.rows("", 0, [], t, dark))
        .when(Boolean(this.error) || !this.entries.get("")?.length, el => el.child(div().p(8).text_size(12).text_color(t.dim).child(this.error || (this.loading ? "Loading files…" : this.root ? "No files" : "No folder"))))
        .when(this.limited, el => el.child(div().p(8).text_size(11).text_color(t.dim).child("File list limited to 500 entries per folder and 5,000 total")))))
      .when(Boolean(this.file), el => el.child(this.preview(t)))
      .when(this.jobs.length > 0, el => el.child(h_flex().h(30).flex_none().px(14).gap(8).items_center().border_t(1).border_color(t.border).text_size(12).text_color(t.muted)
        .child(svg(`${DIR}/spinner.svg`).size(12).flex_none().text_color(t.working).spin(900))
        .child(div().flex_1().min_w(0).truncate().child(this.jobs.length === 1 ? T()[this.jobs[0].kind === "upload" ? "uploading" : "downloading"](this.jobs[0].name) : T().transferring(this.jobs.length)))));
  }
}
