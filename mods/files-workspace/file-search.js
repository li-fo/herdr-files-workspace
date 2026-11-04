import { div } from "gpui-kit";
import { Input, InputState, h_flex, v_flex } from "gpui-base";
import { theme } from "herdr";
import { exec } from "./windows.js";

export function filterPaths(paths, query) {
  query = query.toLowerCase().replaceAll("\\", "/");
  if (!/[?*]/.test(query)) return paths.filter(path => path.toLowerCase().includes(query));
  const pattern = query.split("").map(c => c === "*" ? ".*" : c === "?" ? "." : c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("");
  const re = new RegExp("^" + pattern + "$", "i");
  return paths.filter(path => re.test(query.includes("/") ? path : path.split("/").pop()));
}
export async function searchPaths(root, on, cancelled) {
  const git = await exec("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", "."], { cwd: root, on }).catch(() => null);
  if (cancelled()) return null;
  if (git?.code === 0) return { paths: [...new Set(git.stdout.split("\0").filter(Boolean))].sort(), note: "Git files · ignored files excluded" };
  return { paths: [], note: "Search needs an accessible Git folder. Recursive scanning is disabled." };
}
export default class FileSearch {
  constructor(owner) { this.owner = owner; this.revision = 0; }
  open(cx) {
    if (!this.input) {
      this.input = InputState.new({ placeholder: "Name, path or *.md" });
      this.input.on("change", (_e, cx) => cx.notify());
      this.input.on("submit", (_e, cx) => { const path = this.results()[0]; if (path) this.owner.openTab(path, cx); });
    }
    this.visible = true; this.input.focus(); if (!this.paths || this.root !== this.owner.root || this.on !== this.owner.on) this.scan(cx);
  }
  scan(cx) {
    const revision = ++this.revision, root = this.owner.root, on = this.owner.on;
    this.root = root; this.on = on; this.paths = []; this.error = null; this.note = null;
    if (!root) { this.busy = false; return; }
    this.busy = true;
    const cancelled = () => revision !== this.revision || root !== this.owner.root || on !== this.owner.on;
    cx.spawn(async cx => {
      try {
        const result = await searchPaths(root, on, cancelled);
        if (!cancelled() && result) { this.paths = result.paths; this.note = result.note; }
      } catch (error) { if (!cancelled()) this.error = String(error.message || error); }
      finally { if (!cancelled()) { this.busy = false; cx.notify(); } }
    });
  }
  results() {
    const query = this.input?.value() || "";
    if (!this.filtered || this.filtered.paths !== this.paths || this.filtered.query !== query)
      this.filtered = { paths: this.paths, query, result: filterPaths(this.paths || [], query) };
    return this.filtered.result;
  }
  close() { this.revision++; this.input?.release(); }
  render(cx) {
    if (this.root !== this.owner.root || this.on !== this.owner.on) this.scan(cx);
    const t = theme(), results = this.results();
    const button = (id, label, fn) => div().id(`file-search-${id}`).px(5).py(4).cursor_pointer().hover(s => s.bg(t.hover)).on_click((_e, cx) => fn(cx)).child(label);
    return v_flex().w_full().flex_1().min_h(0).min_w(0).p(6).gap(5).text_size(12)
      .on_key_down((e, cx) => { if (e.key === "escape") { this.visible = false; this.revision++; if (this.busy) this.paths = null; cx.stop_propagation(); cx.notify(); } })
      .child(h_flex().w_full().flex_none().gap(3).items_center().child(Input.new(this.input).flex_1().min_w(0).h(28).px(5).bg(t.raised))
        .child(button("refresh", "↻", cx => this.scan(cx)))
        .child(button("close", "×", cx => { this.visible = false; this.revision++; if (this.busy) this.paths = null; cx.notify(); })))
      .child(div().w_full().flex_none().truncate().text_color(t.muted).child(this.busy ? "Searching…" : this.error || `${results.length} files${results.length > 200 ? " · first 200 shown; narrow the search" : ""}`))
      .child(div().w_full().flex_none().truncate().text_color(t.dim).child(this.note || ""))
      .child(v_flex().id("file-search-results").w_full().flex_1().min_h(0).overflow_y_scrollbar()
        .children(results.slice(0, 200).map(path => div().id(`file-search-${path}`).w_full().h(28).flex_none().px(5).py(5).truncate().cursor_pointer().hover(s => s.bg(t.hover))
          .on_click((_e, cx) => this.owner.openTab(path, cx)).child(path))));
  }
}
