import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { agents, spaces, props, theme, shared, setShared, run, closeOverlay, nextCommand, terminals, openOverlay } from "herdr";
import Tabs from "./tabs.js";
import { KEY, MOD, state, leaves } from "./split.js";
import { choose, showSplit, showNormal, closeSplit, request, applyRequest, resetRequests } from "./actions.js";

export default class AgentWorkspace extends Tabs {
  init(_props, cx) {
    if (!props()?.role || props().role === "tabs") {
      super.init();
      setShared(KEY + ".keep-on-space-change", localStorage.getItem("keep-on-space-change") === "true");
      resetRequests();
      cx.spawn(async cx => {
        for (;;) {
          const command = await nextCommand();
          if (command === "choose") choose();
          if (command === "show") await showSplit();
          if (command === "normal") showNormal();
          if (command === "close") await closeSplit();
          if (command === "apply") await applyRequest();
          if (command === "toggle-follow") {
            const keep = shared(KEY + ".keep-on-space-change") !== true;
            localStorage.setItem("keep-on-space-change", String(keep));
            setShared(KEY + ".keep-on-space-change", keep);
          }
          cx.notify();
        }
      });
    }
    this.picks = [];
    this.axis = "row";
  }
  close() { this.scroll?.release(); }
  button(id, text, action, enabled = true) {
    const t = theme();
    return div().id(id).px(8).py(5).rounded(5).flex_none().cursor_pointer()
      .text_color(enabled ? t.foreground : t.dim).hover(s => s.bg(t.hover))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click((_e, cx) => { cx.stop_propagation(); if (enabled) action(cx); }).child(text);
  }
  render(cx) {
    const p = props() || {}, role = p.role;
    if (role === "view-settings") {
      const keep = shared(KEY + ".keep-on-space-change") === true;
      return v_flex().size_full().p(7).bg(theme().popover).text_size(13)
        .child(this.button("keep-on-space-change", `${keep ? "[✓]" : "[ ]"} Keep Agents View when switching Spaces`, () => {
          run(MOD + ".toggle-follow"); closeOverlay(p.overlay);
        }));
    }
    if (!["picker", "header", "menu"].includes(role)) return super.render(cx);
    const t = theme(), list = agents(), ss = spaces(), current = state(shared(KEY)), items = leaves(current.tree);
    // Original two-agent header props did not include a view ID.
    const target = p.view || p.target || items.find(n => n.agent.address === p.address)?.id;
    if (role === "header") {
      const agent = list.find(a => a.address === p.address), zoomed = current.zoom === target;
      const live = terminals().some(a => a.address === p.address);
      return h_flex().size_full().min_w(0).px(7).gap(4).items_center().border_b(1).border_color(t.border).text_size(12)
        .child(div().id("agent-origin").flex_1().min_w(0).truncate().cursor_pointer().text_color(t.foreground)
          .hover(s => s.text_color(t.accent)).on_click(() => request("origin", { target }))
          .child(`${agent?.space_name || p.name} · ${p.machine || "This computer"}`))
        .child(div().flex_none().text_size(10).text_color(t[agent?.status] || t.muted).child(agent?.status || (live ? "Terminal" : "Unavailable")))
        .child(this.button("zoom-agent", zoomed ? "Restore" : "Zoom", () => request("zoom", { target })))
        .child(this.button("agent-menu", "…", () => openOverlay({ mod: MOD, kind: "popup", width: 245, height: 310, props: { role: "menu", target } })));
    }
    if (role === "menu") {
      const act = action => { closeOverlay(p.overlay); action(); };
      return v_flex().size_full().p(7).gap(2).bg(t.popover).text_size(13)
        .child(this.button("go-to-space", "Go to Space", () => act(() => request("origin", { target }))))
        .child(this.button("add-right", "Add to the right…", () => act(() => choose("add-right", target))))
        .child(this.button("add-below", "Add below…", () => act(() => choose("add-below", target))))
        .child(this.button("replace-agent", "Change agent…", () => act(() => choose("replace", target))))
        .child(this.button("swap-agent", "Swap positions…", () => act(() => choose("swap", target)), items.length > 1))
        .child(this.button("menu-zoom", current.zoom === target ? "Restore layout" : "Zoom this view", () => act(() => request("zoom", { target }))))
        .child(this.button("remove-agent", "Remove this view", () => act(() => request("remove", { target }))))
        .child(this.button("back-to-tabs", "Back to workspace", () => act(() => showNormal())));
    }
    const mode = p.mode || "create", multiple = mode === "create";
    const existing = new Set(items.filter(n => n.id !== (mode === "replace" ? target : null)).map(n => n.agent.address));
    const choices = mode === "swap"
      ? items.filter(n => n.id !== target).map(n => ({ key: n.id, name: n.agent.name, detail: n.agent.address, status: "" }))
      : list.filter(a => multiple || !existing.has(a.address)).map(a => ({ key: a.address,
        name: `${a.space_name} · ${a.title || a.program?.name || a.address}`,
        detail: `${ss.find(s => s.id === a.space)?.machine || "This computer"} · ${a.address}`, status: a.status }));
    const valid = this.picks.length > 0 && (multiple || this.picks.length === 1) && this.picks.every(key => choices.some(a => a.key === key));
    const title = {create:"Select agents", swap:"Swap positions", replace:"Change agent", "add-right":"Add to the right", "add-below":"Add below"}[mode];
    return v_flex().size_full().p(16).gap(10).bg(t.background).text_color(t.foreground)
      .child(div().text_size(18).child(title || "Agents View"))
      .child(div().text_size(12).text_color(t.muted).child(multiple
        ? "Choose one or more agents. Start with a few; add mixed splits from each view menu."
        : "Choose a view or agent. Existing sessions keep running."))
      .when(multiple, el => el.child(h_flex().gap(8)
        .child(this.button("initial-row", `${this.axis === "row" ? "● " : ""}Side by side`, cx => { this.axis = "row"; cx.notify(); }))
        .child(this.button("initial-column", `${this.axis === "column" ? "● " : ""}Top to bottom`, cx => { this.axis = "column"; cx.notify(); }))))
      .child(v_flex().id("agent-choices").flex_1().min_h(0).overflow_y_scrollbar().gap(4)
        .when(!choices.length, el => el.child(div().p(12).child("No other agents available.")))
        .children(choices.map(a => {
          const selected = this.picks.includes(a.key);
          return h_flex().id(`choose-${a.key}`).p(10).gap(8).rounded(6).cursor_pointer()
            .bg(selected ? t.selected : t.background).hover(s => s.bg(t.hover))
            .on_click((_e, cx) => {
              this.picks = selected ? this.picks.filter(x => x !== a.key) : multiple ? [...this.picks, a.key] : [a.key];
              cx.notify();
            })
            .child(div().flex_none().child(selected ? `[${this.picks.indexOf(a.key) + 1}]` : "[ ]"))
            .child(v_flex().flex_1().min_w(0)
              .child(div().truncate().child(a.name))
              .child(div().text_size(11).text_color(t.muted).truncate().child(a.detail)))
            .child(div().flex_none().text_size(12).text_color(t[a.status] || t.muted).child(a.status));
        })))
      .child(div().text_size(12).text_color(t.muted).child(`${this.picks.length} selected. Removing a view does not stop its agent.`))
      .child(h_flex().justify_end()
        .child(this.button("cancel-agents", "Cancel", () => closeOverlay(p.overlay)))
        .child(this.button("apply-agents", multiple ? "Open Agents View" : "Apply", () => {
          if (mode === "swap") { if (request("swap", { target, payload: this.picks[0] })) closeOverlay(p.overlay); return; }
          const live = agents(), machines = spaces();
          const selected = this.picks.map(address => live.find(a => a.address === address));
          if (selected.some(a => !a)) return;
          const picks = selected.map(a => ({ address: a.address, name: a.space_name,
            machine: machines.find(s => s.id === a.space)?.machine || null }));
          const ok = multiple ? request("show", { picks, axis: this.axis }) : request(mode, { target, payload: picks[0] });
          if (ok) closeOverlay(p.overlay);
        }, valid)));
  }
}
