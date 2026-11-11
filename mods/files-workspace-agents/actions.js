import { layout, run, shared, setShared, openOverlay, notify, spaces, panes, agents, exec } from "herdr";
import { KEY, MOD, STACK, SPLIT, state, find, ordinary, withSplit, withoutSplit, captureSizes, leaves, newTree, editTree } from "./split.js";
const REQUEST = KEY + ".request";
const BUSY = KEY + ".busy";
export function choose(mode = "create", target = null) {
  openOverlay({ mod: MOD, kind: "dialog", width: 680, height: 540, props: { role: "picker", mode, target } });
}
function problem(error) { notify({ title: "Agents View", body: String(error.message || error), level: "error" }); return false; }
export function currentState() { return captureSizes(shared(KEY), layout()); }
function saveState(current) {
  // The public JS-to-host bridge limits nesting to 16. Store the tree as JSON,
  // not nested host arguments; layouts are sent as a CLI argument for the same reason.
  setShared(KEY, { ...current, tree: JSON.stringify(current.tree) });
}
export function request(action, args = {}) {
  if (shared(BUSY)) return problem(new Error("A view change is in progress. Please try again in a moment."));
  setShared(BUSY, true);
  setShared(REQUEST, JSON.stringify({ action, ...args }));
  run(MOD + ".apply");
  return true;
}
export function resetRequests() { setShared(REQUEST, null); setShared(BUSY, false); }
export async function applyRequest() {
  try {
    const raw = shared(REQUEST);
    if (!raw) return;
    const r = JSON.parse(raw);
    if (r.action === "show") await showSplit(r.picks, r.axis);
    else if (r.action === "close") await closeSplit();
    else if (r.action === "origin") goToSpace(r.target);
    else await changeView(r.action, r.target, r.payload);
  } catch (error) { problem(error); }
  finally { resetRequests(); }
}
export function showNormal() {
  const child = ordinary(layout());
  if (child) { run("layout.select", { stack: STACK, child }); focusNormal(); }
}
function focusNormal() {
  const tab = spaces().find(s => s.active)?.tabs.find(t => t.active)?.id;
  const candidates = panes().filter(p => p.tab === tab);
  const pane = candidates.find(p => p.focused) || candidates[0];
  if (pane) run("pane.focus", { pane: pane.pane });
}
async function publish(value) {
  const current = state(value);
  const next = current.tree ? withSplit(layout(), current) : withoutSplit(layout());
  const result = await exec("herdr-app", ["do", "layout.set", JSON.stringify({ layout: next })]);
  if (result.code !== 0) throw new Error(result.stderr || result.stdout || "Cannot update Agents View.");
  const response = JSON.parse(result.stdout);
  if (response.error || response.ok !== true) throw new Error(response.error || "The layout update was not accepted.");
  saveState(current);
  if (!current.tree) focusNormal();
  return true;
}
export async function showSplit(picks, axis = "row") {
  try {
    const current = currentState();
    if (picks) return await publish({ version: 2, open: true, tree: newTree(picks, axis), zoom: null });
    if (!current.tree) { choose(); return false; }
    if (shared(KEY)?.version === 2 && find(layout(), SPLIT)) {
      saveState({ ...current, open: true });
      run("layout.select", { stack: STACK, child: SPLIT });
      return true;
    }
    return await publish({ ...current, open: true });
  } catch (error) { return problem(error); }
}
export async function changeView(action, target, payload) {
  try { return await publish(editTree(currentState(), action, target, payload)); }
  catch (error) { return problem(error); }
}
export async function closeSplit() {
  try { return await publish({ version: 2, open: false, tree: null, zoom: null }); }
  catch (error) { return problem(error); }
}
export function goToSpace(target) {
  const item = leaves(currentState().tree).find(n => n.id === target);
  const agent = item && agents().find(a => a.address === item.agent.address);
  const pane = agent && panes().find(p => p.terminal === agent.address);
  if (!agent || !pane || !spaces().some(s => s.id === agent.space))
    return problem(new Error("The agent has no available source pane. Use the Agents sidebar to inspect its status."));
  const normal = ordinary(layout());
  if (!normal) return problem(new Error("The original workspace view is unavailable."));
  saveState(currentState());
  run("layout.select", { stack: STACK, child: normal });
  run("space.select", { id: agent.space });
  run("tab.select", { id: pane.tab });
  run("pane.focus", { pane: pane.pane });
  return true;
}
