// Layout/state operations only. Keep session lifecycle commands out of this module.
export const MOD = "files-workspace-agents";
export const STACK = "files-workspace-views";
export const SPLIT = "files-workspace-agent-split";
// Retain storage/layout IDs to migrate the original two-agent view.
export const KEY = "files-workspace.agent-split";
export function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children || []) { const found = find(child, id); if (found) return found; }
  return null;
}
export function leaves(tree) {
  if (!tree) return [];
  return tree.agent ? [tree] : (tree.children || []).flatMap(leaves);
}
function fresh() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }
function weight(n) { return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 1; }
export function group(axis, children, id = fresh()) {
  return { id, axis, children, weights: children.map(() => 1) };
}
export function newTree(picks, axis = "row") {
  if (!picks.length) return null;
  if (!["row", "column"].includes(axis)) throw new Error("Invalid split direction.");
  const addresses = new Set(picks.map(p => p.address));
  if (addresses.size !== picks.length || picks.some(p => !p.address)) throw new Error("Choose different agents.");
  const items = picks.map(agent => ({ id: fresh(), agent: { ...agent } }));
  return items.length === 1 ? items[0] : group(axis, items);
}
export function state(value) {
  const ids = new Set(), addresses = new Set();
  function clean(node, depth = 0) {
    if (!node || depth > 32 || typeof node.id !== "string" || ids.has(node.id)) return null;
    ids.add(node.id);
    if (node.agent) {
      if (typeof node.agent.address !== "string" || !node.agent.address || addresses.has(node.agent.address)) return null;
      addresses.add(node.agent.address);
      return { id: node.id, agent: { ...node.agent } };
    }
    if (!Array.isArray(node.children) || !["row", "column"].includes(node.axis)) return null;
    const children = [], weights = [];
    node.children.forEach((child, i) => { const next = clean(child, depth + 1); if (next) { children.push(next); weights.push(weight(node.weights?.[i])); } });
    if (children.length < 2) return children[0] || null;
    return { id: node.id, axis: node.axis, children, weights };
  }
  let storedTree = value?.tree;
  if (typeof storedTree === "string") { try { storedTree = JSON.parse(storedTree); } catch { storedTree = null; } }
  let tree = value?.version === 2 ? clean(storedTree) : null;
  if (value?.version !== 2 && Array.isArray(value?.picks)) {
    const picks = value.picks.filter(p => typeof p?.address === "string" && p.address);
    const unique = picks.filter((p, i) => picks.findIndex(x => x.address === p.address) === i).slice(0, 2);
    const items = unique.map((agent, i) => ({ id: String(i), agent: { ...agent } }));
    tree = items.length > 1 ? group("row", items, "legacy") : items[0] || null;
  }
  const zoom = leaves(tree).some(n => n.id === value?.zoom) ? value.zoom : null;
  return { version: 2, open: Boolean(value?.open && tree), tree, zoom };
}
export function isSplit(root) { return find(root, STACK)?.active === SPLIT; }
export function ordinary(root) { return find(root, STACK)?.children?.find(n => n.id !== SPLIT)?.id; }
export function captureSizes(value, root) {
  const current = state(value);
  if (current.zoom) return current;
  function visit(node) {
    if (!node || node.agent) return;
    const rendered = find(root, `fw-agent-group-${node.id}`) || (node.id === "legacy" ? find(root, SPLIT) : null);
    if (rendered) node.weights = node.children.map((child, i) => {
      const id = child.agent ? `fw-agent-${child.id}` : `fw-agent-group-${child.id}`;
      return weight(rendered.children?.find(n => n.id === id)?.size?.weight ?? node.weights[i]);
    });
    node.children.forEach(visit);
  }
  visit(current.tree); return current;
}
export function makeSplit(value) {
  const current = Array.isArray(value) ? { tree: newTree(value), zoom: null } : state(value);
  function render(node) {
    const hidden = Boolean(current.zoom && !leaves(node).some(n => n.id === current.zoom));
    if (!node.agent) return {
      id: `fw-agent-group-${node.id}`, type: node.axis, hidden,
      gap: 8, min: 0, resizable: !current.zoom, divider: { width: 1, color: "border" },
      children: node.children.map((child, i) => ({ ...render(child), size: { weight: weight(node.weights[i]) } }))
    };
    const pick = node.agent;
    return { id: `fw-agent-${node.id}`, type: "column", hidden, min: 0, resizable: false,
      border: { width: 1, color: "border" }, radius: 8, background: "background",
      focus: { border: { width: 1, color: "accent" } },
      children: [
        { id: `fw-agent-header-${node.id}`, type: "block", size: { px: 34 },
          content: { mod: MOD, props: { role: "header", view: node.id, ...pick } } },
        { id: `fw-agent-terminal-${node.id}`, type: "block", content: { terminal: pick.address } }
      ] };
  }
  return { id: SPLIT, type: "column", min: 0, resizable: false, children: current.tree ? [render(current.tree)] : [] };
}
export function withSplit(root, value) {
  const current = Array.isArray(value) ? { version: 2, open: true, tree: newTree(value), zoom: null } : state(value);
  if (!current.tree) throw new Error("Choose at least one agent.");
  const copy = JSON.parse(JSON.stringify(root)), stack = find(copy, STACK);
  if (!stack) throw new Error("Install the Files Workspace layout before opening Agents View.");
  stack.children = stack.children.filter(n => n.id !== SPLIT).concat(makeSplit(current));
  stack.active = SPLIT; return copy;
}
export function withoutSplit(root) {
  const copy = JSON.parse(JSON.stringify(root)), stack = find(copy, STACK);
  if (stack) { stack.children = stack.children.filter(n => n.id !== SPLIT); stack.active = stack.children[0]?.id; }
  return copy;
}
export function visibleTerminals(root) {
  const out = [];
  function visit(node) { if (!node || node.hidden) return; if (node.content?.terminal) out.push(node.content.terminal); (node.children || []).forEach(visit); }
  visit(find(root, SPLIT)); return out;
}
export function editTree(value, action, target, payload) {
  const current = state(value), items = leaves(current.tree), subject = items.find(n => n.id === target);
  if (!subject) throw new Error("This view is no longer available.");
  if (action === "zoom") { current.zoom = current.zoom === target ? null : target; return current; }
  if (!["add-right", "add-below", "replace", "remove", "swap"].includes(action)) throw new Error("Unknown view action.");
  current.zoom = null;
  if (["add-right", "add-below", "replace"].includes(action)) {
    if (!payload?.address || items.some(n => n.id !== (action === "replace" ? target : null) && n.agent.address === payload.address))
      throw new Error("This agent is already in Agents View.");
  }
  if (action === "add-right" || action === "add-below") {
    function depth(node, level = 0) {
      if (node.id === target) return level;
      return Math.max(-1, ...(node.children || []).map(child => depth(child, level + 1)));
    }
    if (depth(current.tree) >= 30) throw new Error("This layout is too deeply nested. Add beside a higher-level view.");
  }
  const other = action === "swap" ? items.find(n => n.id === payload) : null;
  if (action === "swap" && (!other || other.id === target)) throw new Error("Choose another view.");
  function edit(node) {
    if (action === "swap") {
      if (node.id === target) return other;
      if (node.id === other.id) return subject;
    }
    if (node.id === target) {
      if (action === "remove") return null;
      if (action === "replace") return { ...node, agent: { ...payload } };
      if (action === "add-right" || action === "add-below")
        return group(action === "add-right" ? "row" : "column", [node, { id: fresh(), agent: { ...payload } }]);
    }
    if (node.agent) return node;
    const children = [], weights = [];
    node.children.forEach((child, i) => { const next = edit(child); if (next) { children.push(next); weights.push(node.weights[i]); } });
    if (children.length < 2) return children[0] || null;
    return { ...node, children, weights };
  }
  current.tree = edit(current.tree); current.open = Boolean(current.tree); return current;
}
export function returnToTab(previous, current, keepOnSpaceChange = false) {
  if (!previous?.space || !current?.space) return false;
  return previous.space !== current.space ? !keepOnSpaceChange : previous.tab !== current.tab;
}
