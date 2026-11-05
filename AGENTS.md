# Project instructions

- Keep all features in the Files Workspace mod and its installation files. Do not modify or rebuild Herdr itself. Use only public mod APIs. Prefer separate modules that can be removed when Herdr provides the feature.
- Use the project's CodeGraph index to inspect symbols, callers, and change impact. Check freshness with `codegraph status`; use `codegraph sync` after changes when needed.
- Inspect Herdr's Rust implementation and verify live UI behavior separately. An internal Rust feature does not imply that the mod API exposes it.
- Commit changes by feature so each feature can be rolled back separately. Preserve unrelated user changes.
- Keep original author attribution and license notices.

## Gallery installation

For “add this layout” or “install Files Workspace” requests:

1. Read the running app's `~/.config/herdr-app/AGENTS.md` (or the folder selected by `HERDR_APP_HOME`).
2. This installation workflow supports Windows and Herdr 0.1.13 or later. Do not present the legacy `install.sh` as a full macOS/Linux installer.
3. Read `WINDOWS.md`. Clone this public repository over HTTPS, or use an existing checkout. Preserve local changes when updating it.
4. Run `powershell -NoProfile -ExecutionPolicy Bypass -File .\install-windows.ps1` from this repository. It installs both mods and scoped keys, creates/connects the `files-workspace` layout, and activates it. No manual layout edit is needed for the shipped main layout.
5. Honor custom app folders with `-AppHome` or `HERDR_APP_HOME`. Use `-NoActivate` only when the user wants to keep the current layout active.
6. Confirm both mod checks pass. Inspect `herdr-app status` for errors and the selected layout. Open a file and check the tab and header controls in the app; initial mod checks alone do not validate all rendering.
7. Report any missing dependencies or unsupported platform. Local Node.js is needed for Mermaid, OpenSSH SCP for transfers, and remote Python 3 for remote POSIX text editing. Do not change Herdr itself.

If installation fails, report the error and backup path. The installer retries temporary file locks and restores affected files on failure. Preserve existing user layouts, shortcuts, and unrelated files.
