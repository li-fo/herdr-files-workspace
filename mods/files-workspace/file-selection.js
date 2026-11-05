// Selection follows visible tree order, independently of native UI elements.
export class FileSelection {
  constructor(items = [], anchor = null) { this.items = new Map(items.map(item => [item.path, item])); this.anchor = anchor; }
  click(item, visible, modifiers = {}) {
    const additive = modifiers.control || modifiers.platform;
    if (modifiers.shift) {
      const start = visible.findIndex(row => row.path === this.anchor);
      const end = visible.findIndex(row => row.path === item.path);
      if (!additive) this.items.clear();
      const range = start >= 0 && end >= 0 ? visible.slice(Math.min(start, end), Math.max(start, end) + 1) : [item];
      for (const row of range) this.items.set(row.path, row);
      if (start < 0) this.anchor = item.path;
    } else {
      if (!additive) this.items.clear();
      if (additive && this.items.has(item.path)) this.items.delete(item.path);
      else this.items.set(item.path, item);
      this.anchor = item.path;
    }
    return this.items.get(item.path) || [...this.items.values()].at(-1) || null;
  }
  clear() { this.items.clear(); this.anchor = null; }
  remove(path) {
    for (const selected of this.items.keys()) if (selected === path || selected.startsWith(path + '/')) this.items.delete(selected);
    if (this.anchor === path || this.anchor?.startsWith(path + '/')) this.anchor = null;
  }
}

export function visibleFiles(entries, folders, prefix = '', depth = 0, out = []) {
  if (depth > 40) return out;
  for (const entry of entries.get(prefix) || []) {
    if (out.length >= 5000) break;
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    out.push({path, dir: entry.dir});
    if (entry.dir && folders.has(path)) visibleFiles(entries, folders, path, depth + 1, out);
  }
  return out;
}

// Do not transfer/delete a child twice when its parent folder is also selected.
export function selectionRoots(items) {
  return items.filter(item => !items.some(parent => parent.dir && item.path.startsWith(parent.path + '/')));
}
