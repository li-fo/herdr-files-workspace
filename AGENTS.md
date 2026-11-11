# Project instructions

- Keep all features in the Files Workspace mod and its installation files. Do not modify or rebuild Herdr itself. Use only public mod APIs. Prefer separate modules that can be removed when Herdr provides the feature.
- Use the project's CodeGraph index to inspect symbols, callers, and change impact. Check freshness with `codegraph status`; use `codegraph sync` after changes when needed.
- Inspect Herdr's Rust implementation and verify live UI behavior separately. An internal Rust feature does not imply that the mod API exposes it.
- Test changes before committing. Commit only when the user explicitly requests it, with separate commits by feature for rollback. Push only when explicitly requested. Preserve unrelated user changes.
- Keep original author attribution and license notices.

## Gallery installation

For “add this layout” or “install Files Workspace” requests:

1. Read the running app's `~/.config/herdr-app/AGENTS.md` (or the folder selected by `HERDR_APP_HOME`).
2. Require Herdr 0.1.13 or later. macOS installation and basic use have been confirmed on Herdr 0.1.14; this is not full feature certification. Linux is untested. Do not present the legacy `install.sh` as a full macOS/Linux installer.
3. On Windows, read `WINDOWS.md`. On macOS, read `tests/macos/herdr-files-workspace-macos.md` and its experimental Python installer, including replacement and recovery limits. Clone this public repository over HTTPS, or use an existing checkout. Preserve local changes when updating it.
4. On Windows, run `powershell -NoProfile -ExecutionPolicy Bypass -File .\install-windows.ps1` from this repository. It installs the Files, header, and agent-view mods and scoped keys, creates/connects the `files-workspace` layout, and activates it. On macOS, follow the separate experimental installation notes; do not run the Windows installer.
5. Honor custom app folders with `HERDR_APP_HOME` (or `-AppHome` on Windows). The Windows installer also supports `-NoActivate` when the user wants to keep the current layout active.
6. Confirm all three mod checks pass. Inspect `herdr-app status` for errors and the selected layout. Open a file and check the tab and header controls in the app; initial mod checks alone do not validate all rendering. For agent-view changes, check the picker, split rendering, focus, and Space switching separately.
7. Report any missing dependencies or unsupported platform. Local Node.js is needed for Mermaid, OpenSSH SCP for transfers, and remote Python 3 for remote POSIX text editing. Do not change Herdr itself.

If installation fails, report the error and backup path. The Windows installer retries temporary file locks and restores affected files on failure. The experimental macOS installer's activation step is outside its automatic rollback block; follow its documented recovery limits. Preserve existing user layouts, shortcuts, and unrelated files.
