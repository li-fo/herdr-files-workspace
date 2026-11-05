# Files Workspace modules

Keep features in the mod. Do not change Herdr or depend on private APIs.
Use CodeGraph to check callers before a change. Check the installed Herdr type
files before you use an API. Run `codegraph sync` after code changes.

| Module | Responsibility |
| --- | --- |
| `main.js` | File tree, panel actions, menus, dialogs, and legacy media previews |
| `file-tabs.js` | Workspace tab identity and file-open routing |
| `document.js` | Editor state, save/reload commands, draft updates, and header state |
| `document-search.js` / `search-text.js` | Search UI and text matching/replacement |
| `text-buffer.js` / `drafts.js` / `remote-text.js` | Text format, draft recovery, and conflict-checked file I/O |
| `markdown-preview.js` | Native Markdown preview UI |
| `preview-session.js` | Preview generations and generated asset lifetime; no Herdr dependency |
| `preview-files.js` | Diagram worker process and temporary file cleanup |
| `diagram-view.js` | Diagram zoom and pan |
| `transfer-queue.js` | Download/upload jobs, completion checks, and notifications |
| `file-operations.js` | Directory listing, SSH targets, and named transfer operations |
| `windows.js` / `windows.ps1` | Windows process adapter and native file operations |
| `files-workspace-header` | Optional document controls in the pane header |

## State rules

- Send typed text and replacement text through `Document.applyTextChange`.
  This updates the buffer, dirty status, and pending draft state together.
- Save a snapshot. Edits made during the save must stay dirty.
- Do not create an editor or publish header state after the document closes.
- A preview session accepts results only from its current generation.
  Dispose stale results and completed assets when replaced or closed.
- The transfer queue owns job state. The panel supplies translated messages
  and a refresh callback. Keep new platform commands out of panel rendering.
- Search results cannot move the native editor cursor with the current public
  API. Do not emulate private editor controls.

## Installation

`install-windows.ps1` checks both source mods before it changes installed files.
It creates a custom layout from `main` when needed, connects both mods, and
activates the layout after installation unless `-NoActivate` is set.
It skips unchanged mod files and retries temporary file locks.
It backs up each affected file and writes `restore.json` in the backup folder.
It copies dependencies before entry points and checks both installed mods.
If installation fails, it restores the affected files.

The manifest in `data/files-workspace/install-manifest.json` lists managed files.
Later installations remove retired files from this list only. Unknown files
remain in place. The first manifest cannot identify files from older installers.

## Verification

Run the Node tests in `tests`, except the remote tests unless a test machine is
available. Run `tests/installer.ps1` for install rollback and managed-file checks.
The Windows and remote tests use synthetic files; see `WINDOWS.md`.

`herdr-app check` checks initial rendering only. Inspect the live application
for deferred search rows, previews, dialogs, and async results after a UI change.
The pure preview-session tests cover out-of-order completion and close during
rendering without a native UI mock.

Keep further extraction small. Menus and tree rendering can stay in `main.js`
until a change needs a separate boundary. Do not add a general plugin framework.
