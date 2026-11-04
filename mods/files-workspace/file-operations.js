import { hc, window } from "herdr";
import { exec, windows, isWindows } from "./windows.js";

// The ssh target behind a Herdr machine name (hc machine ls: "dev@host" or an ssh-config alias).
export async function sshTarget(machine) {
  const r = await hc(["machine", "ls", "--json"]);
  const m = JSON.parse(r.stdout || "{}").machines?.find(x => x.name === machine);
  if (!m?.target) throw new Error(`No ssh address for machine ${machine}`);
  return m.target;
}

export async function directory(path, on) {
  if (!on && window()?.platform === "windows") {
    const r = await windows("list", [path]);
    if (r.code !== 0) throw new Error(r.stderr || "Cannot list this folder");
    const result = JSON.parse(r.stdout || "[]");
    return Array.isArray(result) ? result : [result];
  }
  const script = 'n=0; for p in "$1"/* "$1"/.[!.]* "$1"/..?*; do [ -e "$p" ] || [ -L "$p" ] || continue; name=${p##*/}; [ "$name" = .git ] && continue; if [ -d "$p" ] && [ ! -L "$p" ]; then kind=d; else kind=f; fi; printf "%s\\0%s\\0" "$kind" "$name"; n=$((n+1)); [ "$n" -gt 500 ] && break; done; test -d "$1"';
  const r = await exec("sh", ["-c", script, "files", path], { on });
  if (r.code !== 0) throw new Error(r.stderr || "Cannot list this folder");
  const fields = r.stdout.split("\0"), out = [];
  for (let i = 0; i + 1 < fields.length; i += 2) out.push({ name: fields[i + 1], dir: fields[i] === "d" });
  return out;
}

// Runs detached so a download isn't bound by exec's 30 s. It fetches into a hidden
// temporary folder next to the target, then claims a free name atomically ("a (1).txt")
// and writes that path to <status>.dest and the exit code to <status>.
const FETCH = `src=$1 dir=$2 name=$3 st=$4 mode=$5 isdir=$6
mkdir -p "$dir" "\${st%/*}" || exit 1
rm -f "$st" "$st.dest"
tmp=$(mktemp -d "$dir/.herdr-download.XXXXXX") || exit 1
nohup sh -c '
mode=$1 src=$2 tmp=$3 dir=$4 name=$5 isdir=$6 st=$7
if [ "$mode" = scp ]; then scp -r -p -o BatchMode=yes -o ConnectTimeout=15 "$src" "$tmp/$name"; else cp -R -p "$src" "$tmp/$name"; fi >"$st.log" 2>&1
code=$?
if [ $code = 0 ]; then
  base=$name ext=
  if [ "$isdir" != 1 ]; then case "$name" in ?*.*) base=\${name%.*} ext=.\${name##*.};; esac; fi
  dest="$dir/$name" i=0
  if [ "$isdir" = 1 ]; then
    while ! mkdir "$dest" 2>/dev/null; do [ -e "$dest" ] || { code=1; break; }; i=$((i+1)); dest="$dir/$base ($i)$ext"; done
    if [ $code = 0 ]; then (cd "$tmp/$name" && for f in * .[!.]* ..?*; do if [ -e "$f" ] || [ -L "$f" ]; then mv "$f" "$dest/" || exit 1; fi; done) || code=1; fi
  else
    while ! ln "$tmp/$name" "$dest" 2>/dev/null; do [ -e "$dest" ] || { code=1; break; }; i=$((i+1)); dest="$dir/$base ($i)$ext"; done
  fi
  [ $code = 0 ] && printf %s "$dest" >"$st.dest"
fi
rm -rf "$tmp"
echo $code >"$st"' fetch "$mode" "$src" "$tmp" "$dir" "$name" "$isdir" "$st" </dev/null >/dev/null 2>&1 &`;

// Upload, detached like FETCH: copies local files into a temporary folder on the target
// (made beforehand with mktemp there) and writes the exit code to <status>.
const SEND = `st=$1 mode=$2 dest=$3; shift 3
mkdir -p "\${st%/*}" || exit 1
rm -f "$st"
nohup sh -c 'st=$1 mode=$2 dest=$3; shift 3
if [ "$mode" = scp ]; then scp -r -p -o BatchMode=yes -o ConnectTimeout=15 "$@" "$dest"; else cp -R -p "$@" "$dest"; fi >"$st.log" 2>&1
echo $? >"$st"' send "$st" "$mode" "$dest" "$@" </dev/null >/dev/null 2>&1 &`;

// Runs on the target machine once an upload is in: moves each uploaded item from the
// temporary folder into place under a free name, prints the names it used, removes the folder.
const PLACE = `tmp=$1 dir=$2
for p in "$tmp"/* "$tmp"/.[!.]* "$tmp"/..?*; do
  [ -e "$p" ] || [ -L "$p" ] || continue
  name=\${p##*/} base=\${p##*/} ext= i=0 dest="$dir/\${p##*/}"
  if [ -d "$p" ] && [ ! -L "$p" ]; then
    while ! mkdir "$dest" 2>/dev/null; do [ -e "$dest" ] || exit 1; i=$((i+1)); dest="$dir/$name ($i)"; done
    (cd "$p" && for f in * .[!.]* ..?*; do if [ -e "$f" ] || [ -L "$f" ]; then mv "$f" "$dest/" || exit 1; fi; done) || exit 1
  else
    case "$name" in ?*.*) base=\${name%.*} ext=.\${name##*.};; esac
    while ! ln "$p" "$dest" 2>/dev/null; do [ -e "$dest" ] || exit 1; i=$((i+1)); dest="$dir/$base ($i)$ext"; done
  fi
  printf '%s\\n' "\${dest##*/}"
done
rm -rf "$tmp"`;

// Explicit operation names keep platform dispatch out of the panel and queue.
export const startDownload = args => isWindows() ? windows("download", args) : exec("sh", ["-c", FETCH, "fetch", ...args]);
export const startUpload = args => isWindows() ? windows("send", args) : exec("sh", ["-c", SEND, "send", ...args]);
export const placeUpload = (tmp, dir, on) => !on && isWindows() ? windows("place", [tmp, dir]) : exec("sh", ["-c", PLACE, "place", tmp, dir], {on});
