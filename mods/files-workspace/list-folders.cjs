const fs = require("node:fs");
const path = require("node:path");

function list(folder) {
  const entries = [];
  try {
    const directory = fs.opendirSync(folder);
    try {
      let item;
      while (entries.length < 501 && (item = directory.readSync())) {
        if (/^(?:\.git$|\.herdr-(?:upload|download)\.)/i.test(item.name)) continue;
        let dir = item.isDirectory();
        if (item.isSymbolicLink()) {
          try { dir = fs.statSync(path.join(folder, item.name)).isDirectory(); }
          catch { /* Keep dangling links visible as files. */ }
        }
        entries.push({ name: item.name, dir });
      }
    } finally { directory.closeSync(); }
    return { entries, error: null };
  } catch (error) {
    return { entries: [], error: error.message };
  }
}

process.stdout.write(JSON.stringify(process.argv.slice(2).map(list)));
