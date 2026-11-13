import { div, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme, settings, appHome } from "herdr";

export class DiagramViewport {
  constructor(width, height) { this.width = width; this.height = height; this.scale = 1; this.x = 0; this.y = 0; this.fitted = true; }
  layout(width) {
    // Fit is a compact overview. Manual zoom uses the document's vertical scroll.
    const height = this.fitted
      ? Math.max(180, Math.min(480, this.height * Math.min(1, width / this.width)))
      : Math.max(180, this.height * this.scale);
    if (this.vw !== width || this.vh !== height) this.resize(width, height);
    return height;
  }
  resize(width, height) {
    this.vw = width; this.vh = height;
    if (this.fitted) this.fit(); else this.clamp();
  }
  fit() {
    this.fitted = true;
    this.scale = Math.min(1, this.vw / this.width, this.vh / this.height);
    this.x = (this.vw - this.width * this.scale) / 2; this.y = (this.vh - this.height * this.scale) / 2;
    this.drag = null;
  }
  zoom(scale) {
    scale = Math.max(Math.min(this.vw / this.width, this.vh / this.height, 0.1), Math.min(4, scale));
    const ratio = scale / this.scale;
    this.x = this.vw / 2 - (this.vw / 2 - this.x) * ratio;
    this.y = this.vh / 2 - (this.vh / 2 - this.y) * ratio;
    this.scale = scale; this.fitted = false; this.drag = null; this.clamp();
  }
  clamp() {
    const bound = (offset, imageSize, viewport) => imageSize <= viewport ? (viewport - imageSize) / 2 : Math.max(viewport - imageSize, Math.min(0, offset));
    this.x = bound(this.x, this.width * this.scale, this.vw);
    this.y = bound(this.y, this.height * this.scale, this.vh);
  }
  begin(point) { this.drag = { point, x: this.x, y: this.y }; }
  move(point, zoom = 1) {
    if (!this.drag) return;
    this.x = this.drag.x + (point.x - this.drag.point.x) / zoom;
    this.y = this.drag.y + (point.y - this.drag.point.y) / zoom;
    this.clamp();
  }
}

export function diagramView(block, id, width) {
  const result = block.diagram, t = theme();
  const state = block.viewport ||= new DiagramViewport(result.width, result.height);
  const height = state.layout(width);
  const action = (suffix, label, fn) => div().id(`${id}-${suffix}`).flex_none().px(8).py(4).rounded(4).cursor_pointer()
    .hover(s => s.bg(t.hover)).on_click((_e, cx) => { cx.stop_propagation(); fn(); cx.notify(); }).child(label);
  const file = result.file.replaceAll("\\", "/").replace(appHome().replaceAll("\\", "/") + "/", "");
  return v_flex().w_full().min_w(0).flex_none().border_1().border_color(t.border).rounded(6).overflow_hidden()
    .child(h_flex().w_full().flex_none().px(6).gap(4).items_center().text_size(12)
      .child(div().flex_1().min_w(0).truncate().text_color(t.muted).child("Mermaid · drag to pan"))
      .child(action("out", "−", () => state.zoom(state.scale / 1.25)))
      .child(div().flex_none().text_color(t.muted).child(`${Math.round(state.scale * 100)}%`))
      .child(action("in", "+", () => state.zoom(state.scale * 1.25)))
      .child(action("actual", "100%", () => state.zoom(1)))
      .child(action("fit", "Fit", () => state.fit())))
    .child(div().id(id).relative().w_full().h(height).flex_none().overflow_hidden().cursor_grab().bg(t.background)
      .on_mouse_down("left", (e, cx) => { cx.stop_propagation(); state.begin(e.position); })
      .on_mouse_move((e, cx) => { if (state.drag) { state.move(e.position, settings().zoom || 1); cx.notify(); } })
      .on_mouse_up("left", (_e, cx) => { state.drag = null; cx.notify(); })
      .on_hover((hovered, _cx) => { if (!hovered) state.drag = null; })
      .child(image(file).absolute().left(state.x).top(state.y).w(result.width * state.scale).h(result.height * state.scale)));
}
