# Project instructions

- Keep all features in the Files Workspace mod and its installation files. Do not modify or rebuild Herdr itself. Use only public mod APIs. Prefer separate modules that can be removed when Herdr provides the feature.
- Use the project's CodeGraph index to inspect symbols, callers, and change impact. Check freshness with `codegraph status`; use `codegraph sync` after changes when needed.
- Inspect Herdr's Rust implementation and verify live UI behavior separately. An internal Rust feature does not imply that the mod API exposes it.
- Commit changes by feature so each feature can be rolled back separately. Preserve unrelated user changes.
- Keep original author attribution and license notices.
