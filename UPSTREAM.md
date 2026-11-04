# Upstream Files Transfer documentation

Historical documentation for the upstream project. For this fork, use [README.md](README.md).

**Herdr's Files panel with file transfer.** Right-click a file or folder to download it to your Mac, paste files copied in Finder to upload them, create, rename, move to the Trash or delete, or copy a path. It works the same on this computer and on remote machines your spaces run on over ssh. Files and folders show VS Code's colored icons.

![Files Transfer menu](preview.png)

A mod for the [Herdr](https://herdr.dev) desktop app. It replaces the shipped Files panel.

## What it does

- **Download** a file or a whole folder to `~/Downloads`. From a remote space it copies with `scp` through the same ssh address Herdr uses for that machine. Big files are fine: transfers run in the background, with a line at the bottom of the panel while they go and a notification when they're done.
- **Upload:** copy files or folders in Finder (⌘C), right-click a folder in Files and choose **Paste into this folder** (or right-click empty space to paste into the folder shown). Or click a row and press **⌘V**: it pastes into the selected folder, beside the selected file, or into the shown folder when nothing is selected. Dragging files from Finder onto the panel does the same.
- **Never overwrites:** if the name is taken, the new copy becomes `name (1).ext`. Unfinished transfers sit in a hidden temporary folder, so a half-copied file never appears under its real name.
- **New file**, **New folder** and **Rename**, in a small name dialog. Existing names are refused, never replaced.
- **Move to Trash** on this Mac (Finder's Put Back works). On a remote machine, which has no Trash, **Delete** asks first and deletes permanently.
- **Previews:** Markdown drawn formatted (with a Source toggle) and images fitted to the panel, HEIC and TIFF included, from remote machines too. Pair it with [Preview Plus](https://github.com/linziyanleo/herdr-mods/tree/main/preview-plus) for PDFs, zoom and Markdown links (see below).
- **Copy path**, and **Reveal in Finder** for local files.
- **1184 icons** from [Material Icon Theme](https://github.com/material-extensions/vscode-material-icon-theme), matched the way VS Code does (`package.json`, `app.spec.ts`, `src/`, `.github/`…), with light-theme variants.
- English or Russian, following the language of macOS.

## Install

Ask the agent running in Herdr:

```
Add the Herdr mod from https://github.com/vladimiryakimenko/herdr-files-transfer
```

Or from a terminal, with Herdr running:

```sh
git clone https://github.com/vladimiryakimenko/herdr-files-transfer
sh herdr-files-transfer/install.sh
```

`install.sh` copies `mods/files-transfer` into `~/.config/herdr-app/mods/` and points the Files panel of the layout on screen at it. Herdr's own layouts are read-only, so a shipped one (`main`) is cloned first as `main-files-transfer` and the window switches to it. Run it again to update the mod.

By hand: copy `mods/files-transfer` to `~/.config/herdr-app/mods/`, then in your layout's JSON (clone a shipped one first: `herdr-app do layout.clone '{"name":"main","as":"my-main"}'`) change the Files block's `"mod": "files"` to `"mod": "files-transfer"`, keeping its `"id": "files"`. Check it with `herdr-app check ~/.config/herdr-app/mods/files-transfer`.

**Uninstall:** switch layouts back (ctrl-shift-l), delete `~/.config/herdr-app/mods/files-transfer` and the cloned layout file.

## With Preview Plus

[Preview Plus](https://github.com/linziyanleo/herdr-mods/tree/main/preview-plus) by linziyanleo adds PDF pages, image zoom and followable Markdown links. Install its `mods/preview-plus/` too, then make your layout's Files block a stack of the two (keep `"id": "files"`):

```json
{ "id": "files", "type": "stack", "active": "files-plus-tree", "children": [
  { "id": "files-plus-tree", "type": "block", "content": { "mod": "files-transfer", "props": { "previewStack": "files" } } },
  { "id": "preview-plus", "type": "block", "content": { "mod": "preview-plus", "props": { "previewStack": "files" } } } ] }
```

Clicking Markdown, PNG, JPEG, WebP, SVG or PDF then opens it in Preview Plus, and its ← comes back to the tree. Remote images and PDFs are copied to this Mac first, since Preview Plus reads only local media. Other files keep the built-in preview.

## Requirements

- The Herdr desktop app, macOS. Paste, Copy path and Reveal in Finder use macOS tools (`osascript`, `pbcopy`, `open`).
- For remote machines: `scp` here and ssh access with keys or an agent (no password prompts: it runs with `BatchMode=yes`). Machines added to Herdr through ssh already have this.

## What it runs

`trash` (macOS) for Move to Trash; `sips` for image previews; `sh` and `git` in the shown folder to list it and mark changes, like Herdr's own Files panel. For transfers: `scp`, `cp`, `mktemp` and `mv`/`ln` on the target machine, `rm -rf` when you delete. `defaults read -g AppleLanguages` once, for the language. `hc machine ls` to find a machine's ssh address. No network requests of its own; no data leaves your machines.

## Updating the icons

```sh
node tools/build-icons.mjs            # the pinned version, 5.40.0
node tools/build-icons.mjs 5.41.0     # another one
```

## Credits and license

Code: Apache-2.0, see [LICENSE](LICENSE) and [NOTICE](NOTICE). Based on [File Icons](https://github.com/amster93/herdr-file-icons) by amster93, which is built from Herdr's shipped `files` mod. Icons: [Material Icon Theme](https://github.com/material-extensions/vscode-material-icon-theme), MIT, see [mods/files-transfer/LICENSE-material-icon-theme.txt](mods/files-transfer/LICENSE-material-icon-theme.txt). Menu glyphs and chevrons: [Lucide](https://lucide.dev), ISC, see [LICENSE-Lucide.txt](LICENSE-Lucide.txt).

---

## По-русски

Панель Files для Herdr с передачей файлов. Правый клик по файлу или папке: **скачать** в «Загрузки», **вставить** файлы, скопированные в Finder (загрузка на сервер; или выделите строку и нажмите ⌘V), **новый файл**, **новая папка**, **переименовать**, **в Корзину** (на сервере: удалить с подтверждением), **скопировать путь**, **показать в Finder**. Markdown показывается отформатированным, картинки открываются на просмотр; вместе с Preview Plus ещё PDF и масштаб. Работает и на этом компьютере, и на удалённых машинах по ssh. Файлы можно перетаскивать из Finder в панель. Существующие файлы не перезаписываются: копия получает имя `имя (1).ext`.

Установка, при запущенном Herdr: `sh install.sh` из этой папки. Или попросите агента в Herdr: «Add the Herdr mod from https://github.com/vladimiryakimenko/herdr-files-transfer».
