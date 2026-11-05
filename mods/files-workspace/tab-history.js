import { spaces, shared, setShared, run } from "herdr";

const HISTORY_KEY = "files-workspace.tab-history";

// Observe rendered selection changes, not a timer: short visits count too.
export function recordTabVisit() {
  const space = spaces().find(item => item.active);
  const tab = space?.tabs.find(item => item.active);
  if (!tab) return;
  const history = shared(HISTORY_KEY) || {};
  const previous = history[space.id] || [];
  const live = new Set(space.tabs.map(item => item.id));
  const next = [tab.id, ...previous.filter(id => id !== tab.id && live.has(id))].slice(0, 100);
  if (JSON.stringify(next) !== JSON.stringify(previous)) {
    setShared(HISTORY_KEY, { ...history, [space.id]: next });
  }
}

export function selectBeforeClosing(closing) {
  if (!closing.size) return;
  recordTabVisit();
  const space = spaces().find(item => item.active);
  const active = space?.tabs.find(item => item.active);
  if (!active || !closing.has(active.id)) return;
  const live = new Set(space.tabs.filter(item => !item.settled && !closing.has(item.id)).map(item => item.id));
  const previous = (shared(HISTORY_KEY) || {})[space.id] || [];
  const target = previous.find(id => live.has(id));
  // Select first so Herdr does not briefly activate a neighbouring deleted tab.
  if (target) run("tab.select", { id: target });
}
