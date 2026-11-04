const priority = { A: 1, D: 2, M: 3, U: 4 };
export function addGitMark(marks, path, status, root) {
  path = path.replaceAll("\\", "/"); root = root.replaceAll("\\", "/").replace(/\/$/, "");
  if (path.endsWith("/")) marks[path] = status;
  let current = path.replace(/\/$/, "");
  while (current && (current === root || current.startsWith(root + "/"))) {
    if (!marks[current] || priority[status] > priority[marks[current]]) marks[current] = status;
    if (current === root) break;
    current = current.slice(0, current.lastIndexOf("/"));
  }
}
export function gitMark(marks, path) {
  path = path.replaceAll("\\", "/");
  if (marks[path]) return marks[path];
  // git status --untracked-files=normal represents an entirely new folder once.
  let parent = path;
  while (parent.includes("/")) {
    parent = parent.slice(0, parent.lastIndexOf("/"));
    if (marks[parent + "/"] === "A") return "A";
  }
  return null;
}
