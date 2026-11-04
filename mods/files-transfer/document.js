import { div } from "gpui-kit";
import { v_flex, h_flex, Editor, EditorState } from "gpui-base";
import { theme, settings, nextCommand, shared, run, focused, layout, setShared } from "herdr";
import { TextBuffer } from "./text-buffer.js";
import { TAB_KEY } from "./file-tabs.js";
import { loadText, saveText } from "./remote-text.js";
import { readDraft, persistDraft, restoreDraft } from "./drafts.js";

export function language(file) {
  const name = file.split(/[\\/]/).pop().toLowerCase();
  const named = { dockerfile: "sh", makefile: "make", ".gitignore": "txt", ".env": "sh" };
  const ext = name.includes(".") ? name.split(".").pop() : "txt";
  return named[name] || ({ ts: "js", tsx: "js", jsx: "js", mjs: "js", cjs: "js", jsonc: "json", yml: "yaml", toml: "yaml", vue: "html", svelte: "html" }[ext] || ext);
}
export default class Document {
  init(info, cx) {
    this.info = info;
    this.headerToken = `${Date.now()}-${Math.random()}`;
    this.error = null;
    this.saving = false;
    this.load(cx);
    // Do not persist the entire document or redraw all mods on every keystroke.
    cx.timer.every(1000, () => this.flushDraft());
    cx.spawn(async cx => {
      for (;;) {
        const command = await nextCommand();
        const tab = (shared(TAB_KEY) || {})[this.info.key]?.tab;
        if (command === "header") this.takeHeader(cx);
        if (command === "save" && focused()?.tab === tab) this.save(cx);
      }
    });
  }
  load(cx) {
    if (this.loading || this.saving) return;
    this.loading = true;
    this.error = null;
    this.publishHeader();
    cx.spawn(async cx => {
      try {
        let loaded, loadError;
        try { loaded = await loadText(this.info); }
        catch (error) { if (!readDraft(this.info.key) || this.discardArmed) throw error; loadError = String(error.message || error); }
        const restored = this.discardArmed
          ? { buffer: new TextBuffer(loaded.text), version: loaded.version, note: null }
          : restoreDraft(this.info.key, loaded);
        const buffer = restored.buffer;
        const t = theme();
        const editor = EditorState.new({ value: buffer.text, language: language(this.info.file), readonly: false,
          font_family: settings().font_family, font_size: 13,
          syntax: { keyword: t.ansi5, string: t.ansi2, comment: t.dim, function: t.ansi4, type: t.ansi3, number: t.ansi1, constant: t.ansi6 } });
        this.editor?.release(); this.editor = editor; this.buffer = buffer; this.version = restored.version;
        this.note = restored.note; this.error = loadError || null;
        editor.on("change", (_event, cx) => {
          this.buffer.text = editor.value(); this.discardArmed = false; this.draftPending = true;
          this.note = null; this.updateTitle(); cx.notify();
        });
        if (this.discardArmed) persistDraft(this.info.key, buffer, this.version);
        this.discardArmed = false;
        this.updateTitle();
      } catch (error) { this.error = String(error.message || error); }
      finally { this.loading = false; this.publishHeader(); }
      cx.notify();
    });
  }
  publishHeader() {
    const state = { token: this.headerToken, ready: Boolean(this.buffer), dirty: Boolean(this.buffer?.dirty), saving: Boolean(this.saving), loading: Boolean(this.loading), discard: Boolean(this.discardArmed) };
    const encoded = JSON.stringify(state);
    if (encoded !== this.headerState) {
      this.headerState = encoded;
      setShared("files-transfer.editor:" + this.info.key, state);
    }
  }
  takeHeader(cx) {
    const key = "files-transfer.editor-action:" + this.info.key;
    const request = shared(key);
    if (!request || request.token !== this.headerToken || request.id === this.headerRequest) return;
    this.headerRequest = request.id;
    setShared(key, null);
    if (request.action === "save") this.save(cx);
    else if (request.action === "reload") this.reload(cx);
  }
  updateTitle() {
    this.publishHeader();
    const tab = (shared(TAB_KEY) || {})[this.info.key]?.tab;
    if (!tab) return;
    const title = this.info.file.split(/[\\/]/).pop() + (this.buffer?.dirty ? " •" : "");
    if (title !== this.title) { this.title = title; run("tab.rename", { id: tab, name: title }); }
  }
  save(cx) {
    if (!this.buffer?.dirty || this.saving || this.loading) return;
    this.saving = true; this.error = null; this.publishHeader(); cx.notify();
    cx.spawn(async cx => {
      try {
        const snapshot = this.buffer.snapshot();
        this.version = await saveText(this.info, snapshot, this.version);
        this.buffer.saved(snapshot); this.discardArmed = false;
        this.note = null; this.draftPending = true; this.flushDraft();
      } catch (error) { this.error = String(error.message || error); }
      finally { this.saving = false; this.updateTitle(); cx.notify(); }
    });
  }
  reload(cx) {
    if (this.buffer?.dirty && !this.discardArmed) { this.discardArmed = true; this.publishHeader(); cx.notify(); return; }
    this.load(cx);
  }
  flushDraft() {
    if (!this.buffer || !this.draftPending) return;
    persistDraft(this.info.key, this.buffer, this.version); this.draftPending = false;
  }
  close() { this.flushDraft(); this.editor?.release();
    const key = "files-transfer.editor:" + this.info.key;
    if (shared(key)?.token === this.headerToken) setShared(key, null);
  }
  render(cx) {
    const t = theme();
    const pathInHeader = JSON.stringify(layout()).includes("files-transfer-header");
    const button = (id, label, action) => div().id(id).px(9).py(4).rounded(5).cursor_pointer().hover(s => s.bg(t.hover)).on_click((_e, cx) => action(cx)).child(label);
    return v_flex().size_full().min_h(0).bg(t.background).text_color(t.foreground)
      .on_key_down((e, cx) => { if (e.keystroke === "ctrl-s" || e.keystroke === "cmd-s") { cx.stop_propagation(); this.save(cx); } })
      .when(!pathInHeader, el => el.child(h_flex().h(36).flex_none().px(12).gap(8).items_center().border_b(1).border_color(t.border).text_size(12)
        .child(div().flex_1().min_w(0).truncate().text_color(t.muted).child(pathInHeader ? "" : (this.info.on ? this.info.on + ":" : "") + this.info.file))
        .child(div().text_color(t.dim).child(this.saving ? "Saving…" : this.buffer?.dirty ? "Modified" : ""))
        .when(Boolean(this.buffer), el => el.child(button("file-save", "Save", cx => this.save(cx))))
        .child(button("file-reload", this.discardArmed ? "Discard & reload" : "Reload", cx => this.reload(cx)))))
      .when(Boolean(this.error) && Boolean(this.editor), el => el.child(div().px(12).py(8).text_size(12).text_color(t.ansi1).child(this.error)))
      .when(Boolean(this.note), el => el.child(div().px(12).py(6).text_size(12).text_color(t.muted).child(this.note)))
      .child(this.editor ? Editor.new(this.editor).flex_1().min_h(0) : div().p(16).text_color(t.muted).child(this.error || "Loading file…"));
  }
}
