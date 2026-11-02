# Windows port

Installed mod: `C:\Users\pgh\.config\herdr-app\mods\files-transfer`

Active layout: `main-files-transfer-windows`, cloned from `main`. The original layout is preserved.

Use **Files** in the tab bar. Right-click a file or folder for download, paste, new file/folder, rename, copy path, Explorer reveal, and Recycle Bin. Explorer file copies can be pasted with **Ctrl+V** while the panel has keyboard focus, or dragged onto the target folder. Remote items retain the explicit permanent-delete confirmation.

Choose **Download to…** to select a local destination and start downloading there. Herdr remembers that folder across panels and restarts; the quick-download item becomes **Download to <selected path>**. Canceling the picker leaves the previous destination unchanged and starts no transfer. Until a folder is selected, quick download uses the Windows Downloads known folder. To change it again (including back to Downloads), use **Download to…** again. Each running transfer keeps the destination it started with.

The port adds `windows.js` and `windows.ps1`, using Windows PowerShell 5.1 and OpenSSH `scp.exe`. Commands receive escaped JSON data; filenames are not evaluated as shell code. The actual Windows Downloads known-folder setting is used, including redirected Downloads folders. Local operations use literal paths and refuse replacement; completed transfers publish under a free name. A failed publish leaves staged files available for recovery and reports their location.

Transfers run in hidden worker processes. The UI polls their completion files. The mod reads the folder on screen and may execute local/remote commands; network traffic is SSH/SFTP to the selected Herdr machine. It does not upload files to a third-party service.

## Verification

```powershell
node tests/windows.mjs
node tests/download-settings.mjs
node tests/remote.mjs dgx01
herdr-app check "$env:USERPROFILE\.config\herdr-app\mods\files-transfer" | Out-Host
```

Tests create synthetic fixtures, check Unicode/quotes/brackets, collision handling, hidden files, background workers, image conversion, and cleanup boundaries. The remote test uses one unique `/tmp/herdr-files-transfer-test.*` directory, verifies byte-identical round trips, and removes that remote directory. Local test fixtures remain in ignored `.test-*` folders for inspection. The Windows test reads the clipboard without changing it and puts one explicitly named synthetic file in the Recycle Bin.

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
