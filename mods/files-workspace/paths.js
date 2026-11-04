export function relativePath(path, root, insensitive = false) {
  const parts = value => value.replaceAll("\\", "/").replace(/\/$/, "").split("/");
  if (!root) return path.replaceAll("\\", "/");
  const target = parts(path), base = parts(root);
  const equal = (a, b) => insensitive ? a.toLowerCase() === b.toLowerCase() : a === b;
  if (/^[a-z]:$/i.test(target[0]) && !equal(target[0], base[0])) return path.replaceAll("\\", "/");
  let common = 0;
  while (common < target.length && common < base.length && equal(target[common], base[common])) common++;
  return [...base.slice(common).map(() => ".."), ...target.slice(common)].join("/") || ".";
}
