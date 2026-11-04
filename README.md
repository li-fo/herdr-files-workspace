# Herdr Files Workspace

A lightweight file workspace for Herdr: browse project files, open them in Space
tabs, edit text, and transfer files between your computer and SSH machines.

Repository: [li-fo/herdr-files-workspace-pr](https://github.com/li-fo/herdr-files-workspace-pr).

## Features

- Project file tree with colored icons and expanded-folder state preserved while
  opening files or switching between file tabs.
- Reusable Space tabs for text editing and image viewing.
- Native syntax highlighting, explicit Save/Ctrl+S, external-change checks,
  and local recovery drafts. No completion, language server or debugger.
- Markdown opens in Source. Its header offers a read-only Preview, including
  Mermaid diagrams rendered locally with bundled Pele. Switching modes keeps
  unsaved edits and does not save the file.
- Local and SSH remote editing of UTF-8 text up to 1 MiB. BOM and uniform LF/CRLF
  are preserved; binary files and mixed line endings are not editable.
- Upload/paste/drag-and-drop, background downloads, and a remembered destination.
- File/folder creation, rename, copy path, Explorer reveal and local Recycle Bin.
  Remote deletion requires confirmation; transfers avoid replacing existing files.
- Compact file-path header with Modified/Save/Reload and always-visible pane controls.
- Optional Preview Plus access for Markdown/images and PDFs when configured.

## Install or update on Windows

With Herdr running:

```powershell
git clone git@github.com:li-fo/herdr-files-workspace-pr.git
cd herdr-files-workspace-pr
powershell -NoProfile -File .\install-windows.ps1
```

The installer backs up the installed mod, keys and applicable custom layout,
merges scoped save shortcuts, and checks the mod. See [WINDOWS.md](WINDOWS.md)
for first-time layout setup, limitations, tests and rollback.

Remote editing requires Python 3 on the remote POSIX host and working SSH/SCP.
Mermaid previews require local Node.js (validated with Node 24); plain Markdown
preview does not. No browser, CDN or diagram-rendering service is used.
Preview Plus is optional and is not installed automatically. Its setup is
recorded in [the upstream documentation](UPSTREAM.md#with-preview-plus).
The legacy `install.sh` does not merge the editor shortcuts; Windows users
should use the PowerShell installer.

## Saving

Save or Ctrl+S writes the original file. Background recovery drafts do not save
that file: they are stored locally in Herdr shared state, including remote-file
drafts. Reopening a file may restore its unsaved draft. Forced termination can
lose recent typing. Reload asks for a second click before discarding edits.

## Module identifiers

The modules are `files-workspace` and `files-workspace-header`; the custom Windows
layout is `files-workspace`. This is a fresh installation namespace:
old Files Transfer tabs, drafts and settings are not migrated. Close the old file
tabs before switching. Source files on local or remote disks are unaffected.

## Origin and licenses

Based on [Files Transfer for Herdr](https://github.com/vladimiryakimenko/herdr-files-transfer)
at `28f84dd`, which builds on File Icons and Herdr's Files mod. This fork adds
Windows integration, destination selection, Space-tab editing, remote save,
draft recovery and custom pane headers.

Code: Apache-2.0; see [LICENSE](LICENSE) and [NOTICE](NOTICE).
Material Icon Theme icons: MIT. Lucide glyphs: ISC; see
[LICENSE-Lucide.txt](LICENSE-Lucide.txt). Original notices are retained.
