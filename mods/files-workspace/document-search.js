import { div } from "gpui-kit";
import { Input, InputState, h_flex, v_flex } from "gpui-base";
import { theme } from "herdr";
import { matches, replaceMatches } from "./search-text.js";

export default class DocumentSearch {
  constructor(doc) { this.doc = doc; this.index = 0; this.sensitive = false; }
  open(replace, cx) {
    if (!this.query) {
      this.query = InputState.new({ placeholder: "Find text" });
      this.replacement = InputState.new({ placeholder: "Replace with" });
      this.query.on("change", (_e, cx) => { this.index = 0; this.cached = null; cx.notify(); });
      this.query.on("submit", (_e, cx) => this.move(1, cx));
    }
    this.visible = true; this.replacing = replace; this.query.focus(); cx.notify();
  }
  results() {
    const text = this.doc.editor?.value() || "", query = this.query.value();
    if (!this.cached || this.cached.text !== text || this.cached.query !== query || this.cached.sensitive !== this.sensitive)
      this.cached = { text, query, sensitive: this.sensitive, found: matches(text, query, this.sensitive) };
    this.index = Math.min(this.index, Math.max(0, this.cached.found.length - 1));
    return this.cached;
  }
  move(step, cx) { const n = this.results().found.length; this.index = n ? (this.index + step + n) % n : 0; cx.notify(); }
  apply(text, cx) {
    this.doc.editor.set_value(text);
    this.doc.buffer.text = text; this.doc.draftPending = true; this.doc.discardArmed = false;
    this.doc.note = null; this.doc.updateTitle(); cx.notify();
  }
  replace(all, cx) {
    if (this.doc.saving || this.doc.loading) return;
    const { text, found } = this.results(); if (!found.length) return;
    const next = replaceMatches(text, all ? found : [found[this.index]], this.replacement.value());
    if (next === text) return;
    this.undo = { before: text, after: next }; this.apply(next, cx);
  }
  close() { this.query?.release(); this.replacement?.release(); }
  render(cx) {
    const t = theme(), { text, found } = this.results();
    const button = (id, label, fn) => div().id(`search-${id}`).px(7).py(4).cursor_pointer().rounded(4).hover(s => s.bg(t.hover)).on_click((_e, cx) => fn(cx)).child(label);
    const input = state => Input.new(state).flex_1().min_w(0).h(28).px(6).bg(t.raised);
    const start = Math.max(0, this.index - 2), shown = found.slice(start, start + 5);
    return v_flex().w_full().min_w(0).flex_none().p(8).gap(5).text_size(12).border_b(1).border_color(t.border)
      .on_key_down((e, cx) => { if (e.key === "escape") { this.visible = false; cx.stop_propagation(); cx.notify(); } })
      .child(h_flex().w_full().flex_none().gap(5).items_center().child(input(this.query))
        .child(button("case", this.sensitive ? "Aa: on" : "Aa: off", cx => { this.sensitive = !this.sensitive; cx.notify(); }))
        .child(button("prev", "Previous", cx => this.move(-1, cx))).child(button("next", "Next", cx => this.move(1, cx)))
        .child(div().child(`${found.length ? this.index + 1 : 0}/${found.length}`))
        .child(button("replace-mode", "Replace", cx => { this.replacing = !this.replacing; cx.notify(); }))
        .child(button("close", "Close", cx => { this.visible = false; cx.notify(); })))
      .when(this.replacing, el => el.child(h_flex().w_full().flex_none().gap(5).items_center().child(input(this.replacement))
        .child(button("one", "Replace", cx => this.replace(false, cx)))
        .child(button("all", "Replace all", cx => this.replace(true, cx)))
        .when(Boolean(this.undo && text === this.undo.after), el => el.child(button("undo", "Undo replace", cx => { if (!this.doc.saving && !this.doc.loading && this.doc.editor.value() === this.undo.after) { this.apply(this.undo.before, cx); this.undo = null; } })))))
      .child(div().w_full().flex_none().truncate().text_color(t.muted).child("Search results show line locations without moving the cursor. Save to write changes to disk."))
      .when(this.replacing, el => el.child(div().w_full().flex_none().text_color(t.muted).child("Replacing resets the editor cursor and native undo history. Undo replace restores the last replacement until you edit again.")))
      .when(Boolean(this.query.value()) && !found.length, el => el.child(div().text_color(t.muted).child("No matches")))
      .children(shown.map((m, i) => div().id(`search-result-${start + i}`).w_full().h(23).flex_none().px(6).py(3).truncate().cursor_pointer()
        .bg(start + i === this.index ? t.selected : t.background)
        .on_click((_e, cx) => { this.index = start + i; cx.notify(); }).child(`${m.line}: ${m.excerpt}`)));
  }
}
