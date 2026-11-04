import { div } from "gpui-kit";
import { v_flex, h_flex, Editor, EditorState } from "gpui-base";
import { readTextFile, theme, settings } from "herdr";

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
    cx.spawn(async cx => {
      try {
        const text = await readTextFile(info.file, { on: info.on });
        if (text === null) throw new Error("File no longer exists.");
        if (/[\x00-\x08\x0e-\x1f]/.test(text)) throw new Error("Binary file — text editing is unavailable.");
        const t = theme();
        this.editor = EditorState.new({ value: text, language: language(info.file), readonly: true,
          font_family: settings().font_family, font_size: 13,
          syntax: { keyword: t.ansi5, string: t.ansi2, comment: t.dim, function: t.ansi4, type: t.ansi3, number: t.ansi1, constant: t.ansi6 } });
      } catch (error) { this.error = String(error.message || error); }
      cx.notify();
    });
  }
  close() { this.editor?.release(); }
  render() {
    const t = theme();
    return v_flex().size_full().min_h(0).bg(t.background).text_color(t.foreground)
      .child(h_flex().h(36).flex_none().px(12).items_center().border_b(1).border_color(t.border)
        .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(t.muted).child((this.info.on ? this.info.on + ":" : "") + this.info.file)))
      .child(this.editor ? Editor.new(this.editor).flex_1().min_h(0) : div().p(16).text_color(t.muted).child(this.error || "Loading file…"));
  }
}
