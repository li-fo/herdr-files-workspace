import { div } from "gpui-kit";
import { Input, InputState, h_flex, v_flex } from "gpui-base";
import { theme } from "herdr";
import { exec } from "./windows.js";

export const filterPaths = (paths, query) => paths.filter(path => path.toLowerCase().includes(query.toLowerCase().replaceAll("\\", "/")));
export async function searchPaths(root, on, directory, cancelled) {
  const git = await exec("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", "."], { cwd: root, on }).catch(() => null);
  if (cancelled()) return null;
  if (git?.code === 0) return { paths: [...new Set(git.stdout.split("\0").filter(Boolean))].sort(), note: "Files in this folder · Git-ignored files excluded" };
  const paths = [], queue = [""], skip = new Set([".git", "node_modules", "vendor", ".venv", "dist", "build"]);
  let visited = 0, partial = false;
  while (queue.length && visited < 100 && paths.length < 10000) {
    if (cancelled()) return null;
    const folder = queue.shift(); visited++;
    let entries;
    try { entries = await directory(folder ? `${root}/${folder}` : root, on); }
    catch { partial = true; continue; }
    if (entries.length >= 500) partial = true;
    for (const entry of entries) {
      const path = folder ? `${folder}/${entry.name}` : entry.name;
      if (entry.dir) { if (!skip.has(entry.name)) queue.push(path); }
      else paths.push(path);
    }
  }
  return { paths: paths.sort(), note: `${partial || queue.length ? "Partial results · scan limit or unreadable folder. " : ""}Dependency/build folders excluded` };
}
export default class FileSearch {
  constructor(owner, directory) { this.owner = owner; this.directory = directory; this.revision = 0; }
  open(cx) {
    if (!this.input) {
      this.input = InputState.new({ placeholder: "Find file name or path" });
      this.input.on("change", (_e, cx) => cx.notify());
      this.input.on("submit", (_e, cx) => { const path = this.results()[0]; if (path) this.owner.openTab(path, cx); });
    }
    this.visible = true; this.input.focus(); this.scan(cx);
  }
  scan(cx) {
    const revision = ++this.revision, root = this.owner.root, on = this.owner.on;
    this.root = root; this.on = on; this.paths = []; this.error = null;
    if (!root) { this.busy = false; return; }
    this.busy = true;
    const cancelled = () => revision !== this.revision || root !== this.owner.root || on !== this.owner.on;
    cx.spawn(async cx => {
      try {
        const result = await searchPaths(root, on, this.directory, cancelled);
        if (!cancelled() && result) { this.paths = result.paths; this.note = result.note; }
      } catch (error) { if (!cancelled()) this.error = String(error.message || error); }
      finally { if (!cancelled()) { this.busy = false; cx.notify(); } }
    });
  }
  results() { return filterPaths(this.paths || [], this.input?.value() || ""); }
  close() { this.revision++; this.input?.release(); }
  render(cx) {
    if (this.root !== this.owner.root || this.on !== this.owner.on) this.scan(cx);
    const t = theme(), results = this.results();
    const button = (id, label, fn) => div().id(`file-search-${id}`).px(5).py(4).cursor_pointer().hover(s => s.bg(t.hover)).on_click((_e, cx) => fn(cx)).child(label);
    return v_flex().w_full().flex_1().min_h(0).min_w(0).p(6).gap(5).text_size(12)
      .on_key_down((e, cx) => { if (e.key === "escape") { this.visible = false; this.revision++; cx.stop_propagation(); cx.notify(); } })
      .child(h_flex().w_full().flex_none().gap(3).items_center().child(Input.new(this.input).flex_1().min_w(0).h(28).px(5).bg(t.raised))
        .child(button("refresh", "↻", cx => this.scan(cx)))
        .child(button("close", "×", cx => { this.visible = false; this.revision++; cx.notify(); })))
      .child(div().w_full().flex_none().truncate().text_color(t.muted).child(this.busy ? "Searching…" : this.error || `${results.length} files${results.length > 200 ? " · first 200 shown; narrow the search" : ""}`))
      .child(div().w_full().flex_none().truncate().text_color(t.dim).child(this.note || ""))
      .child(v_flex().id("file-search-results").w_full().flex_1().min_h(0).overflow_y_scrollbar()
        .children(results.slice(0, 200).map(path => div().id(`file-search-${path}`).w_full().h(28).flex_none().px(5).py(5).truncate().cursor_pointer().hover(s => s.bg(t.hover))
          .on_click((_e, cx) => this.owner.openTab(path, cx)).child(path))));
  }
}
