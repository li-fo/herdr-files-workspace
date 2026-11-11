# Herdr Files Workspace

Herdr Files Workspace is a mod for [Herdr](https://github.com/herdrdev/herdr-app).
Use it to browse, edit, preview, and transfer local files and files on remote POSIX machines through SSH.

![Files Workspace with a document tab, Markdown preview, Mermaid zoom controls, and a project file tree](docs/images/files-workspace-preview.png)

Keep your project files beside your document tabs.
Preview Markdown tables and Mermaid diagrams. Zoom and drag a diagram to inspect its details.

## Install

Start Herdr. Give your coding agent this instruction:

```text
Read ~/.config/herdr-app/AGENTS.md, then add this layout: https://github.com/li-fo/herdr-files-workspace
```

Use **Herdr 0.1.13 or later**.
Windows installation is documented in [WINDOWS.md](WINDOWS.md#manual-installation).
Installation and basic use have also been confirmed on macOS with Herdr 0.1.14.
See the [macOS installation and test notes](tests/macos/herdr-files-workspace-macos.md) for the experimental installer and verification scope.
Linux has not been tested.

The Windows installer creates the `files-workspace` layout and connects its mods and shortcuts.
The agent needs Git to clone the public repository.
For manual installation, updates, and other requirements, see [WINDOWS.md](WINDOWS.md#manual-installation).

## Features

- A file tree with Ctrl/Shift multi-selection that keeps its expanded folders when you open file tabs.
- File tabs in a Herdr Space, with syntax highlighting and search/replace.
- Explicit saving with **Save** or **Ctrl+S**, plus recovery drafts for unsaved edits.
- Markdown **Source / Preview**, with zoom and pan for Mermaid diagrams.
- Image previews for local and remote files.
- File creation, rename, delete, path copy, upload, and download.
- File and folder moves and copies through internal drag-and-drop, **Move to…**, or **Copy to…**.
- A download folder that you can select and use again.
- A shared **Agents View** tab with multiple running agents, mixed splits, position swaps, and zoom/restore.

Markdown files open in **Source** mode. Preview is read-only.
Save writes changes to the original file. A recovery draft does not save that file.
The editor accepts UTF-8 text files up to 1 MiB. It has no code completion or debugger.
Mermaid previews require local Node.js and use the included Pele renderer.
Remote text editing requires Python 3 on the remote machine.

Drag items onto another folder in the file panel. Then select **Move here**, **Copy here**, or **Cancel**.
Use Ctrl/Shift to select multiple items first.
You can also select **Move to…** or **Copy to…** and enter an existing destination folder.
Copy keeps the original files and their tabs. It copies saved file contents, not unsaved editor drafts.
A relative destination starts at the file panel root. Drop onto the move bar to return items to that root.
Moves stay on the same machine and filesystem. Copies stay on the same machine but can cross local drives.
When a name conflicts, select **Overwrite**, **Auto rename**, or **Skip**.
Select **Apply to all remaining conflicts** to reuse your choice for this batch.
Auto rename adds a number before the file extension. Skip keeps the source in place.
Overwrite replaces the entire destination item. It does not merge folders.
Cancel stops the remaining moves. It does not undo items already moved.
Save affected source and destination documents before you move them. Source tabs close after a successful move. Overwritten destination tabs close after either operation.
Close affected split tabs first. Local macOS and remote POSIX moves and copies require Python 3.
Copies use a temporary folder at the destination. Links and junctions are not supported.
Each copied top-level item has a 10-minute execution limit. Interrupted operations can leave a hidden staging folder; the original source is preserved.
Dragging files from another application keeps the existing upload/copy behavior.

See [WINDOWS.md](WINDOWS.md) for operation details, limits, and tests.

Select **Open Agents View** in the top bar. Select one or more agents and choose
**Side by side** or **Top to bottom**. Then select **Open Agents View** in the dialog.
The shared **Agents View** tab stays available across Spaces. The Files panel follows
the selected Space.

Switching Spaces shows the selected Space's last active tab by default.
Right-click **Agents View** and enable **Keep Agents View when switching Spaces**
to keep the overview visible. This preference is saved. Returning to a Space
does not remove the Agents View arrangement.

Use each view's **…** menu to add an agent to the right or below, change the agent,
swap positions, or remove that view. Mix both directions to build a custom layout.
Use **Zoom** to show one view and **Restore** to return to the saved arrangement.
The split ratios are preserved. Use **Go to Space** in the menu, or click the header's
Space name, to open that agent's original tab. Select **Agents View** to return.
An agent without an available source pane cannot use Go to Space.

Closing the shared tab or removing a view does not stop its agents.
Layout changes use the public Herdr CLI; no polling or persistent helper is added.
Start with a few views: more visible terminals require more screen space and rendering work.
This feature was checked on Herdr 0.1.15 on Windows; it has not been tested on macOS.
See [ARCHITECTURE.md](ARCHITECTURE.md) for module responsibilities.
The source is in [files-workspace](mods/files-workspace) and [files-workspace-header](mods/files-workspace-header).

## Original project and authors

This project is a modified version of **Files Transfer for Herdr**.
The original repository owner is **vladimiryakimenko**.
The source for this version starts at commit `28f84dd`.

- Original repository: [vladimiryakimenko/herdr-files-transfer](https://github.com/vladimiryakimenko/herdr-files-transfer).
- Original source: [Files Transfer at commit 28f84dd](https://github.com/vladimiryakimenko/herdr-files-transfer/tree/28f84ddd0b72704011740a428cf722ddf455648c).
- Original documentation: [UPSTREAM.md](UPSTREAM.md).

Files Transfer adds file operations to the Herdr Files panel.
It includes file transfers, file creation, rename operations, and file previews.
It also includes colored file icons and SSH file transfers.
Its original installation instructions are for macOS.

Files Transfer uses code from [File Icons for Herdr](https://github.com/amster93/herdr-file-icons), by **amster93**.
File Icons uses code from the [Herdr Files mod](https://github.com/herdrdev/herdr-app/tree/v0.1.13/defaults/mods/files).
The original copyright notices remain in [NOTICE](NOTICE).

## Licenses

| Component | Source | License |
| --- | --- | --- |
| Project code | This repository and the original projects above | [Apache-2.0](LICENSE) |
| File icons | [Material Icon Theme](https://github.com/material-extensions/vscode-material-icon-theme) | [MIT](mods/files-workspace/LICENSE-material-icon-theme.txt) |
| Menu icons | [Lucide](https://github.com/lucide-icons/lucide) | [ISC](LICENSE-Lucide.txt) |
| Diagram renderer | [Pele](https://github.com/obsidianmd/pele), version 1.13.0 | [MIT](mods/files-workspace/vendor/LICENSE-pele.txt) |

See [NOTICE](NOTICE) for the original source notices.
See [WINDOWS.md](WINDOWS.md) for tests and instructions to restore an earlier version.
