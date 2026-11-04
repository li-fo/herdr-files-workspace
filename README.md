# Herdr Files Workspace

Herdr Files Workspace is a mod for [Herdr](https://github.com/herdrdev/herdr-app).
A mod adds functions to the Herdr application.
This mod lets you find, edit, and transfer files.
It works with local files and files on remote SSH machines.

- Project repository: [li-fo/herdr-files-workspace-pr](https://github.com/li-fo/herdr-files-workspace-pr).
- Mod source code: [mods/files-workspace](mods/files-workspace).
- Header source code: [mods/files-workspace-header](mods/files-workspace-header).

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
File Icons uses code from the [Herdr Files mod](https://github.com/herdrdev/herdr-app/tree/main/defaults/mods/files).
The original copyright notices remain in [NOTICE](NOTICE).

This project adds these functions to the original code:

- Windows file operations.
- A download folder that you can select.
- File tabs in a Herdr Space.
- Text editing and explicit file saving.
- Remote file saving through SSH.
- Recovery of unsaved text.
- Markdown previews with Mermaid diagrams.
- File controls in the panel and tab headers.

## Functions

The Files panel shows a project file tree.
The tree keeps its expanded folders when you open a file tab.
An open file tab does not change the tree root.

The panel header shows the current path and three controls:

| Control | Function |
| --- | --- |
| New | Opens a menu to create a file or folder. |
| Delete | Deletes the selected item. |
| Reload | Updates the file list without closing expanded folders. |

Local Delete operations move items to the Recycle Bin.
Remote Delete operations require confirmation and permanently remove the selected items.
File transfers use a different name if the destination name already exists.

The text editor includes syntax highlighting and line numbers.
It does not include code completion or a debugger.
The editor accepts UTF-8 text files with a maximum size of 1 MiB.
It keeps the byte order mark and consistent LF or CRLF line endings.
It does not accept binary files or mixed line endings.

## Requirements

| Component | Requirement |
| --- | --- |
| Local application | Herdr. |
| Windows operations | Windows PowerShell 5.1 and OpenSSH SCP. |
| Source repository | Git and access to this private repository. |
| Remote file transfers | SSH access without password prompts. |
| Remote text editing | Python 3 on the remote POSIX machine. |
| Mermaid previews | Local Node.js. Tests use Node.js 24. |

Plain Markdown previews do not require Node.js.
The installer includes Pele 1.13.0 for Mermaid diagrams.
It does not download Pele when you open a preview.

## Install on Windows

1. Start Herdr.
2. Open PowerShell.
3. Clone this repository.

   ```powershell
   git clone git@github.com:li-fo/herdr-files-workspace-pr.git
   ```

4. Open the repository folder.

   ```powershell
   cd herdr-files-workspace-pr
   ```

5. Run the installer.

   ```powershell
   powershell -NoProfile -File .\install-windows.ps1
   ```

6. Complete the first installation steps in [WINDOWS.md](WINDOWS.md).

The installer makes backup copies before it changes installed files.
It installs the mod and its save shortcuts.
It checks that Herdr can load the mod.
The first installation also requires a custom layout.

Use the PowerShell installer on Windows.
The older `install.sh` script does not install the save shortcuts.

## Update an existing installation

1. Open PowerShell in your existing repository folder.
2. Get the latest changes.

   ```powershell
   git pull --ff-only
   ```

3. Run the installer.

   ```powershell
   powershell -NoProfile -File .\install-windows.ps1
   ```

## Edit and save a file

1. Select a file in the Files panel.
2. Edit the text in its file tab.
3. Select **Save**, or press **Ctrl+S**.

Save writes the text to the original local or remote file.
The editor checks for external file changes before it saves.
If it finds a change, it keeps your edits and shows an error.

The **Modified** label identifies unsaved edits.
A recovery draft is a local copy of unsaved text.
The mod stores recovery drafts on this computer, including drafts for remote files.
A recovery draft does not change the original file.

The mod can restore a draft when you open the file again.
An unexpected application stop can cause the loss of recent edits.
If you select **Reload** with unsaved edits, a second selection confirms their removal.

## Preview a Markdown file

1. Open a Markdown file.
2. Select **Preview** in the tab header.
3. Select **Source** to return to the editor.

Markdown files always open in **Source** mode.
Preview shows the current text, including unsaved edits.
You cannot edit the text in Preview mode.
A mode change does not save the file or remove your edits.

Herdr renders the Markdown text.
Pele renders Mermaid diagrams as SVG images through local Node.js.
The mod does not send document text to a preview service.

Pele uses different layouts from Mermaid.js.
External Mermaid plugins and arbitrary HTML labels are not supported here.
See [WINDOWS.md](WINDOWS.md) for other preview limits.

Preview Plus is a separate, optional mod.
The built-in Preview function does not require it.
See [Preview Plus setup](UPSTREAM.md#with-preview-plus) for the optional PDF functions.

## Module and layout names

| Item | Name |
| --- | --- |
| File mod | `files-workspace` |
| Header mod | `files-workspace-header` |
| Custom layout | `files-workspace` |

This version does not transfer old Files Transfer tabs, drafts, or settings.
Close the old file tabs before you change to this version.
The name change does not change your local or remote source files.

## Licenses

| Component | Source | License |
| --- | --- | --- |
| Project code | This repository and the original projects above | [Apache-2.0](LICENSE) |
| File icons | [Material Icon Theme](https://github.com/material-extensions/vscode-material-icon-theme) | [MIT](mods/files-workspace/LICENSE-material-icon-theme.txt) |
| Menu icons | [Lucide](https://github.com/lucide-icons/lucide) | [ISC](LICENSE-Lucide.txt) |
| Diagram renderer | [Pele](https://github.com/obsidianmd/pele), version 1.13.0 | [MIT](mods/files-workspace/vendor/LICENSE-pele.txt) |

See [NOTICE](NOTICE) for the original source notices.
See [WINDOWS.md](WINDOWS.md) for tests and instructions to restore an earlier version.
