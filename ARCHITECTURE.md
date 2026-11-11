# Files Workspace modules

Keep features in the mod. Do not change Herdr or depend on private APIs.
Use CodeGraph to check callers before a change. Check the installed Herdr type
files before you use an API. Run `codegraph sync` after code changes.

| Module | Responsibility |
| --- | --- |
| `main.js` | File tree, panel actions, menus, dialogs, and legacy media previews |
| `file-tabs.js` | Workspace tab identity and file-open routing |
| `file-move.js` / `file-drag.js` | Move planning, mutation locks, POSIX no-replace moves, and internal drag state |
| `document.js` | Editor state, save/reload commands, draft updates, and header state |
| `document-search.js` / `search-text.js` | Search UI and text matching/replacement |
| `text-buffer.js` / `drafts.js` / `remote-text.js` | Text format, draft recovery, and conflict-checked file I/O |
| `markdown-preview.js` | Native Markdown preview UI |
| `preview-session.js` | Preview generations and generated asset lifetime; no Herdr dependency |
| `preview-files.js` | Diagram worker process and temporary file cleanup |
| `diagram-view.js` | Diagram zoom and pan |
| `transfer-queue.js` | Download/upload jobs, completion checks, and notifications |
| `file-operations.js` | Deduplicated directory reads, Windows read batches, SSH targets, and named transfer operations |
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
It copies dependencies before entry points and checks all three installed mods.
If installation fails, it restores the affected files.

The manifest in `data/files-workspace/install-manifest.json` lists managed files.
Later installations remove retired files from this list only. Unknown files
remain in place. The first manifest cannot identify files from older installers.

## Verification

The `files-workspace-agents` companion owns the shared Agents View.
Its `tabs.js` adapts Herdr 0.1.15's Apache-2.0 tab bar. `split.js` contains pure
layout transformations; `actions.js` calls public layout commands; `main.js`
provides the picker and terminal headers. The original tab view remains inside
`files-workspace-views`, beside the optional split view. The Files panel is outside
this stack. Composition-terminal focus must not redirect the file browser to
another Space. No terminal spawn, kill, adoption or source-tab move is needed.

The view stores a versioned tree with stable view IDs, terminal addresses, split
weights, and a zoom target. The old two-agent state is migrated on use. The tree
is serialized inside shared state because Herdr's host arguments have a depth
limit. Layout changes use `exec("herdr-app", ["do", "layout.set", JSON])` for the
same reason. The persistent tab copy applies requests from disposable popups;
requests are serialized and failed updates retain saved state. Ordinary view
switching and source-pane navigation use direct public commands.
It uses live agent data without polling. Keep terminal lifecycle operations out
of view-close actions. Run `node tests/agent-split.mjs` and
`node tests/sidebar-location.mjs` when changing this boundary.

Run the Node tests in `tests`, except the remote tests unless a test machine is
available. Run `tests/installer.ps1` for install rollback and managed-file checks.
The Windows and remote tests use synthetic files; see `WINDOWS.md`.

`herdr-app check` checks initial rendering only. Inspect the live application
for deferred search rows, previews, dialogs, and async results after a UI change.
The pure preview-session tests cover out-of-order completion and close during
rendering without a native UI mock.

Keep further extraction small. Menus and tree rendering can stay in `main.js`
until a change needs a separate boundary. Do not add a general plugin framework.

## File tree refresh

Keep collapsed folder listings in the bounded tree cache. Show cached rows before revalidation.
Batch Windows reads (up to 32 folders per process). Limit remote refresh concurrency to four reads.
Share in-flight directory reads, but do not retain them as a permanent filesystem cache.
Keep drag-time refresh deferral and generation checks when changing this flow.
