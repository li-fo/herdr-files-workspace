# Herdr Files Workspace — Windows

Installed mod: `~/.config/herdr-app/mods/files-workspace`

Active layout: `files-workspace`, cloned from `main`. The original layout is preserved.

Herdr 0.1.13 fixes text selection painting in Markdown previews. The installer
removes the previous `#6699cc55` selection override and uses the theme default.
It preserves any different selection color that you configured. Use Herdr
0.1.13 or later with this installer.

## Manual installation

Requirements:

- Herdr 0.1.13 or later, started at least once.
- Git to clone the public repository.
- Windows PowerShell 5.1 and OpenSSH SCP for file operations.
- Local Node.js for Mermaid previews. Plain Markdown does not require Node.js.
- SSH access without password prompts for remote transfers.
- Python 3 on the remote POSIX machine for remote text editing.

For the first installation, open PowerShell and run:

```powershell
git clone https://github.com/li-fo/herdr-files-workspace.git
cd herdr-files-workspace
powershell -NoProfile -ExecutionPolicy Bypass -File .\install-windows.ps1
```

The installer copies the shipped `main` layout to `files-workspace` on the first
installation. It connects the Files block and companion pane header, then
switches to that layout. An existing `files-workspace` layout is updated in place;
its other blocks and custom colors are preserved. The shipped `main` stays unchanged.
If a custom layout lacks a Files block or pane header, installation stops before
changing files and reports the missing structure.

Use `-NoActivate` to install without switching the active layout. Use `-AppHome`
for a custom app folder. By default, the installer uses `HERDR_APP_HOME` when set.

The installer backs up affected files, checks both mods, and adds scoped
Save, Find, and Replace shortcuts. It connects the companion header in the
custom layout. It preserves other layouts and does not install Preview Plus.
Use this PowerShell installer on Windows, not the older `install.sh` script.
The shell script is a legacy installer. It does not install the full current
workspace. macOS and Linux installation is not supported by this guide.

Unchanged mod files are not copied again. Sharing violations are retried for
up to about five seconds per file, including during rollback. Other errors stop
the operation. If a lock persists, let the current file operation finish and rerun
the installer. It reports the backup folder if recovery needs attention.

After installation, run `herdr-app status`. Confirm that the active layout is
`files-workspace` and the error list is empty. Open a text file from the Files
panel and confirm that its tab, Save control, and Find control appear.
Mermaid diagrams also require Node.js. The installer does not install dependencies.

## PowerShell execution policy

The installation command and local file workers use `-ExecutionPolicy Bypass`
for their own PowerShell process. This permits the bundled scripts to run under
a restrictive user execution policy. It does not change the saved user or
machine policy and does not require `Set-ExecutionPolicy`.

Organization policies (`MachinePolicy` or `UserPolicy`) take precedence. If they
block scripts, report the policy error and use the organization's approved
installation method. Do not change organization policy to install this mod.

## Update

Open PowerShell in the existing repository folder and run:

```powershell
git pull --ff-only
powershell -NoProfile -ExecutionPolicy Bypass -File .\install-windows.ps1
```

## File panel and transfers

Use **Ctrl+click** to add or remove individual files or folders from the selection.
Use **Shift+click** to select a range in the visible tree. **Ctrl+Shift+click** adds
that range to the current selection. These clicks do not open files or toggle folders.
A normal click selects one item and keeps the existing open/toggle behavior.
Click empty space or press Escape to clear the selection.

Right-click a selected item to keep the group. The group menu can open selected
files, download selected items to the remembered folder, copy paths (one per line),
or delete items after confirmation. Local deletion uses the Recycle Bin; remote
deletion is permanent. A selected parent folder covers its descendants for transfer
and deletion, so items are not processed twice. A failed batch stops and reports
how many items completed. New and paste need a single target.


Expanded folders and selected files survive file-tab transitions and returning
to previously browsed roots within the running panel. These tree states are
in-memory; restarting/reloading the mod can reset them.

The companion `files-workspace-header` displays the relative file path in
the pane's top header. The Windows installer connects it in the custom
`files-workspace` layout and backs up the previous layout. Other
layouts can use it by changing their pane header's `content.mod` from `pane` to
`files-workspace-header`; the shipped `pane` mod remains unchanged. Modified/Saving status and Save/Reload controls also appear in the header. Without the companion header the editor shows its path
in the original location.

Use **Files** in the tab bar. Right-click a file or folder for download, paste, new file/folder, rename, copy path, Explorer reveal, and Recycle Bin. Explorer file copies can be pasted with **Ctrl+V** while the panel has keyboard focus, or dragged onto the target folder. Remote items retain the explicit permanent-delete confirmation.

The panel header shows its current root path on the left and **New / Delete /
Reload** on the right. New offers file or folder creation inside the selected
folder, beside the selected file, or at the root when nothing is selected.
Delete requires a selection; local items go to the Recycle Bin and remote items
use the existing confirmation. Reload refreshes the tree without collapsing it.

Returning to a recently viewed folder restores its file tree immediately, then
refreshes it in the background. The panel keeps at most 12 inactive folder/machine
trees in memory. Cached entries can briefly show the previous state. First visits
still load the directory, but show its entries before Git status finishes.

After a successful delete or move to the Recycle Bin, matching file tabs close.
Deleting a folder also closes tabs for its files. Failed deletions keep their tabs.
Unsaved edits remain in the existing draft storage. Tabs with split panes stay open
to protect other panes and terminals; close their file pane manually.

While Files Workspace is visible, it records tab visits for each space, including
agent and terminal tabs. If deletion closes the active file tab, it selects the
most recently visited tab that remains open in that space. Batch deletion excludes
all tabs that it will close. Deleting a background file does not change the active
tab. Visits before this feature was installed are not available; without a recorded
destination, Herdr uses its normal tab selection behavior.

Choose **Download to…** to select a local destination and start downloading there. Herdr remembers that folder across panels and restarts; the quick-download item becomes **Download to <selected path>**. Canceling the picker leaves the previous destination unchanged and starts no transfer. Until a folder is selected, quick download uses the Windows Downloads known folder. To change it again (including back to Downloads), use **Download to…** again. Each running transfer keeps the destination it started with.

The port adds `windows.js` and `windows.ps1`, using Windows PowerShell 5.1 and OpenSSH `scp.exe`. Commands receive escaped JSON data; filenames are not evaluated as shell code. The actual Windows Downloads known-folder setting is used, including redirected Downloads folders. Local operations use literal paths and refuse replacement; completed transfers publish under a free name. A failed publish leaves staged files available for recovery and reports their location.

Transfers run in hidden worker processes. The UI polls their completion files. The mod reads the folder on screen and may execute local/remote commands; network traffic is SSH/SFTP to the selected Herdr machine. It does not upload files to a third-party service.

## Lightweight editor

Markdown files always start in **Source**. **Preview** in the pane header shows
the current buffer read-only, including unsaved edits; **Source** switches back
without replacing the editor or saving the file. Ordinary Markdown uses Herdr's
native TextView. Top-level fenced `mermaid` blocks use bundled Pele 1.13.0 via
local Node.js (tested with Node 24), then native SVG images. Code-fence syntax
errors are shown with the diagram source instead of breaking the document.
No document content is uploaded. Temporary diagram files are stored in
`data/files-workspace/markdown` and removed best-effort on tab close.

Pele uses its own layout and does not exactly match Mermaid.js. External Mermaid
plugins, arbitrary HTML labels and diagram interactions are not supported here;
math labels need an additional renderer. Generated images fit the pane width.
Diagram colors are captured when entering Preview; switch Source/Preview after
changing themes. A diagram is limited to 50,000 source characters and 2,000 edges.

Clicking a file opens a reusable tab in its Space. Text files use Herdr's native
editor with extension-based syntax highlighting, line numbers, Save and Ctrl+S.
There is no completion, language server, debugger or Markdown toolbar. Images
open in viewer tabs. Unsupported syntax falls back to plain text.

Editing supports UTF-8 text up to 1 MiB, preserving BOM and uniform LF/CRLF.
Binary files, other encodings and mixed/CR-only line endings are rejected.
Remote editing requires Python 3 and SSH/SCP. Saving checks the original file
before replacing it; external changes produce an error and preserve your edits.
Reload requires a second click to discard modified text.

Unsaved drafts are stored locally in Herdr shared state approximately once per
second and on normal tab close. Reopening the file restores its draft. Forced
termination can lose recent typing. Remote drafts also reside on this computer.

Install all files from `mods/files-workspace/`. Merge the `mod:files-workspace`
section of this repository's `keys.json` into your Herdr `keys.json`, preserving
other sections. Back up both the installed mod and keys before updating.

### Feature commits and rollback

| Commit | Feature |
| --- | --- |
| `3124810` | Open files in Space tabs |
| `e1f549c` | Local text editing, highlighting and explicit save |
| `82e297d` | Remote text loading and saving |
| `9147ce2` | Unsaved draft recovery |

Use `git revert <commit>` to retain history. These features build on each other:
when removing a lower layer, revert dependent commits first, newest first.
To remove the complete editor feature set:

```powershell
git revert 9147ce2 82e297d e1f549c 3124810
```

Reinstall the resulting mod files to apply a rollback to Herdr. Git changes alone
do not update the installed copy. Restore the backed-up keys if removing editing.

## Editor verification

### Search and replace

Mermaid previews have their own view controls: **+** and **−** change zoom, **100%** shows the original size, and **Fit** shows the whole diagram. Drag inside an enlarged diagram to pan. The view clips the image to its own area; normal document scrolling remains available. Zoom is limited to 400%. Leaving the diagram ends the drag. Rebuilding Preview resets each diagram to Fit.

Use **Find** in the document header, or **Ctrl+F** in the editor. Use **Ctrl+H** or the **Replace** button to show replacement controls.
Search uses literal text. **Aa** controls case sensitivity. The result list shows line numbers; **Previous** and **Next** select a result in that list. Results do not move or highlight the native editor cursor.

**Replace** changes the selected match. **Replace all** changes all matches. These changes remain unsaved until **Save** or **Ctrl+S**.
The public editor API replaces the whole buffer: it resets the native cursor, scroll position, and undo history. **Undo replace** restores the most recent replacement if the text has not changed since that replacement. It does not restore the earlier native undo history.

Search and replace are available in document tabs only. The file panel has no search function. Herdr itself is not modified.

```powershell
node tests/file-tabs.mjs
node tests/text-buffer.mjs
node tests/drafts.mjs
node tests/remote-editor.mjs dgx01
```

## Transfer verification

```powershell
node tests/windows.mjs
node tests/download-settings.mjs
node tests/remote.mjs dgx01
herdr-app check "$env:USERPROFILE\.config\herdr-app\mods\files-workspace" | Out-Host
```

Tests create synthetic fixtures, check Unicode/quotes/brackets, collision handling, hidden files, background workers, image conversion, and cleanup boundaries. The remote test uses one unique `/tmp/herdr-files-workspace-test.*` directory, verifies byte-identical round trips, and removes that remote directory. Local test fixtures remain in ignored `.test-*` folders for inspection. The Windows test reads the clipboard without changing it and puts one explicitly named synthetic file in the Recycle Bin.

## Limits

- Remote targets retain the upstream POSIX `sh`, `mktemp`, `ln`, `mv` assumptions; remote Windows hosts are not implemented.
- Transfer of local symbolic links/junctions is rejected. Browse into the target and select its contents instead.
- HEIC/HEIF/AVIF preview depends on installed Windows image codecs. Unsupported formats report a preview error. Ordinary PNG/JPEG/GIF/BMP/SVG/WebP keep the native renderer path; TIFF/ICO use Windows image decoding.
- Large remote previews still use Herdr's foreground command timeout, as upstream does.
- Do not run upstream `install.sh` over this port: it would replace the Windows changes.

To switch back without deleting anything:

```powershell
herdr-app do layout.switch --name main | Out-Host
```

Based on upstream commit `28f84ddd0b72704011740a428cf722ddf455648c`. Original license and notices are retained in the installed mod.
