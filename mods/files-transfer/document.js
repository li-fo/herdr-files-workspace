import { div } from "gpui-kit";
import { v_flex, h_flex, Editor, EditorState } from "gpui-base";
import { readTextFile, writeTextFile, theme, settings, nextCommand, shared, run, focused } from "herdr";
import { TextBuffer } from "./text-buffer.js";
import { TAB_KEY } from "./file-tabs.js";

export function language(file) {
  const name = file.split(/[\\/]/).pop().toLowerCase();
  const named = { dockerfile: "sh", makefile: "make", ".gitignore": "txt", ".env": "sh" };
  const ext = name.includes(".") ? name.split(".").pop() : "txt";
  return named[name] || ({ ts: "js", tsx: "js", jsx: "js", mjs: "js", cjs: "js", jsonc: "json", yml: "yaml", toml: "yaml", vue: "html", svelte: "html" }[ext] || ext);
}
export default class Document {
  init(info, cx) {
    this.info = info;
    this.error = null;
    this.saving = false;
    this.load(cx);
    cx.spawn(async cx => {
      for (;;) {
        const command = await nextCommand();
        const tab = (shared(TAB_KEY) || {})[this.info.key]?.tab;
        if (command === "save" && focused()?.tab === tab) this.save(cx);
      }
    });
  }
  load(cx) {
    if (this.loading || this.saving) return;
    this.loading = true;
    this.error = null;
    cx.spawn(async cx => {
      try {
        const raw = await readTextFile(this.info.file, { on: this.info.on });
        const buffer = new TextBuffer(raw);
        const t = theme();
        const editor = EditorState.new({ value: buffer.text, language: language(this.info.file), readonly: Boolean(this.info.on),
          font_family: settings().font_family, font_size: 13,
          syntax: { keyword: t.ansi5, string: t.ansi2, comment: t.dim, function: t.ansi4, type: t.ansi3, number: t.ansi1, constant: t.ansi6 } });
        this.editor?.release(); this.editor = editor; this.buffer = buffer;
        editor.on("change", (_event, cx) => { this.buffer.text = editor.value(); this.discardArmed = false; this.updateTitle(); cx.notify(); });
        this.discardArmed = false;
        this.updateTitle();
      } catch (error) { this.error = String(error.message || error); }
      finally { this.loading = false; }
      cx.notify();
    });
  }
  updateTitle() {
    const tab = (shared(TAB_KEY) || {})[this.info.key]?.tab;
    if (!tab) return;
    const title = this.info.file.split(/[\\/]/).pop() + (this.buffer?.dirty ? " •" : "");
    if (title !== this.title) { this.title = title; run("tab.rename", { id: tab, name: title }); }
  }
  save(cx) {
    if (!this.buffer?.dirty || this.saving || this.loading || this.info.on) return;
    this.saving = true; this.error = null; cx.notify();
    cx.spawn(async cx => {
      try {
        const snapshot = this.buffer.snapshot();
        await writeTextFile(this.info.file, snapshot.raw, snapshot.expected);
        this.buffer.saved(snapshot); this.discardArmed = false;
      } catch (error) { this.error = String(error.message || error); }
      finally { this.saving = false; this.updateTitle(); cx.notify(); }
    });
  }
  reload(cx) {
    if (this.buffer?.dirty && !this.discardArmed) { this.discardArmed = true; cx.notify(); return; }
    this.load(cx);
  }
  close() { this.editor?.release(); }
  render(cx) {
    const t = theme();
    const button = (id, label, action) => div().id(id).px(9).py(4).rounded(5).cursor_pointer().hover(s => s.bg(t.hover)).on_click((_e, cx) => action(cx)).child(label);
    return v_flex().size_full().min_h(0).bg(t.background).text_color(t.foreground)
      .on_key_down((e, cx) => { if (e.keystroke === "ctrl-s" || e.keystroke === "cmd-s") { cx.stop_propagation(); this.save(cx); } })
      .child(h_flex().h(36).flex_none().px(12).gap(8).items_center().border_b(1).border_color(t.border).text_size(12)
        .child(div().flex_1().min_w(0).truncate().text_color(t.muted).child((this.info.on ? this.info.on + ":" : "") + this.info.file))
        .child(div().text_color(t.dim).child(this.info.on ? "Read only" : this.saving ? "Saving…" : this.buffer?.dirty ? "Modified" : ""))
        .when(Boolean(this.buffer) && !this.info.on, el => el.child(button("file-save", "Save", cx => this.save(cx))))
        .child(button("file-reload", this.discardArmed ? "Discard & reload" : "Reload", cx => this.reload(cx))))
      .when(Boolean(this.error) && Boolean(this.editor), el => el.child(div().px(12).py(8).text_size(12).text_color(t.ansi1).child(this.error)))
      .child(this.editor ? Editor.new(this.editor).flex_1().min_h(0) : div().p(16).text_color(t.muted).child(this.error || "Loading file…"));
  }
}
