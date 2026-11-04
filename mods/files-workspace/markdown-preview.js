import { div } from "gpui-kit";
import { v_flex, TextView } from "gpui-base";
import { theme, settings } from "herdr";
import { diagramView } from "./diagram-view.js";
import { PreviewSession } from "./preview-session.js";
import { renderDiagramFiles } from "./preview-files.js";

export default class MarkdownPreview {
  constructor() { this.session = new PreviewSession(renderDiagramFiles); }
  prepare(text, cx) {
    const t = theme();
    const colors = { "--pele-bg": t.background, "--pele-fg": t.foreground, "--pele-muted": t.muted,
      "--pele-line": t.foreground, "--pele-surface": t.surface, "--pele-surface-alt": t.raised,
      "--pele-border": t.border, "--pele-accent": t.accent };
    cx.spawn(async cx => {
      await this.session.update(text, colors);
      if (!this.session.closed) cx.notify();
    });
  }
  close() { return this.session.close(); }
  render() {
    const t = theme(), { blocks, revision, error } = this.session;
    return v_flex().id("markdown-preview").flex_1().min_h(0).overflow_y_scrollbar().p(18).gap(12)
      .on_size_change((size, cx) => { const width = Math.max(100, size.width / (settings().zoom || 1) - 36); if (width !== this.width) { this.width = width; cx.notify(); } })
      .children(blocks.map((block, i) => {
        if (block.kind === "markdown") return div().flex_none().text_size(14).child(TextView.markdown(`preview-text-${revision}-${i}`, block.text).selectable(true));
        const result = block.diagram;
        if (result?.file) return diagramView(block, `diagram-${revision}-${i}`, this.width || 900);
        return v_flex().flex_none().gap(6).p(12).bg(t.surface)
          .child(div().text_color(t.muted).child(result?.error || error || "Rendering Mermaid…"))
          .when(Boolean(result?.error || error), el => el.child(TextView.markdown(`diagram-error-${i}`, "```text\n" + block.text + "\n```")));
      }));
  }
}
