import { shared, setShared, window } from "herdr";
import { exec, windows } from "./windows.js";
import { selectionRoots } from "./file-selection.js";

const LOCK = "files-workspace.move-lock";
export function normalized(path, win = false) {
  if (win) path = path.replaceAll("\\", "/");
  if (!path || /[\x00-\x1f]/.test(path)) throw new Error("Invalid path.");
  const prefix = win && /^[a-z]:\//i.test(path) ? path.slice(0, 3) : path.startsWith("/") ? "/" : "";
  if (!prefix || (win && (prefix === "/" || path.startsWith("//")))) throw new Error("Use an absolute path (Windows drive paths only).");
  const parts = [];
  for (const part of path.slice(prefix.length).split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") { if (!parts.length) throw new Error("Path is outside the filesystem root."); parts.pop(); }
    else parts.push(part);
  }
  return prefix + parts.join("/");
}
export function matchesPath(file, item, win = false) {
  const norm = p => { const n = normalized(p, win); return win ? n.toLowerCase() : n; };
  const a = norm(file), b = norm(item.src);
  return a === b || (item.dir && a.startsWith(b.replace(/\/$/, "") + "/"));
}
export function planMove(root, items, destination, win = false) {
  root = normalized(root, win);
  const value = win ? destination.replaceAll("\\", "/") : destination;
  if (win && /^[a-z]:[^/]/i.test(value)) throw new Error("Use an absolute drive path.");
  const folder = normalized(value.startsWith("/") || (win && /^[a-z]:\//i.test(value)) ? value : `${root}/${value}`, win);
  const targets = new Set();
  return selectionRoots(items).map(item => {
    if (!item.path || item.path.includes("\\") || item.path.split("/").some(p => !p || p === "." || p === ".." || (win && p.includes(":")))) throw new Error("Invalid source path.");
    const src = normalized(`${root}/${item.path}`, win), dest = normalized(`${folder}/${item.path.split("/").pop()}`, win);
    const identity = win ? dest.toLowerCase() : dest;
    if (targets.has(identity)) throw new Error("Two selected items have the same destination name.");
    targets.add(identity);
    if ((win ? src.toLowerCase() : src) === identity) throw new Error("The item is already in that folder.");
    if (item.dir && matchesPath(folder, {src,dir:true}, win)) throw new Error("A folder cannot move into itself or its children.");
    return {src, dest, dir: Boolean(item.dir)};
  });
}
export function isMoving(info) {
  const lock = shared(LOCK);
  return Boolean(lock && (lock.on || null) === (info.on || null) && lock.items.some(item => matchesPath(info.file, item, !info.on && window()?.platform === "windows")));
}
export function beginMove(items, on) {
  if (shared(LOCK)) throw new Error("Another file operation is still running.");
  const token = `${Date.now()}-${Math.random()}`;
  setShared(LOCK, {token,items,on:on || null}); return token;
}
export function endMove(token) { if (shared(LOCK)?.token === token) setShared(LOCK, null); }

// Same-filesystem, atomic no-replace rename. Python is already used for remote editing.
export const POSIX_MOVE = String.raw`
import os,sys,json,ctypes,errno,shutil,tempfile
sys.stdout.reconfigure(encoding='utf-8')
items=json.loads(sys.argv[1]); done=[]; skipped=[]; conflict=None; error=None
copying=len(sys.argv)>2 and sys.argv[2]=="copy"; copy_temps=[]

def no_links(path):
    p=os.path.abspath(path)
    while p!=os.path.dirname(p):
        if os.path.islink(p): raise ValueError('Moving through symbolic links is not supported: '+p)
        p=os.path.dirname(p)
def check_tree(path):
    no_links(path)
    if os.path.isdir(path):
        for root,dirs,files in os.walk(path):
            for name in dirs+files:
                if os.path.islink(os.path.join(root,name)): raise ValueError('Replacing folders containing symbolic links is not supported.')
try:
    libc=ctypes.CDLL(None,use_errno=True)
    if sys.platform=='darwin':
        rename=libc.renamex_np; rename.argtypes=[ctypes.c_char_p,ctypes.c_char_p,ctypes.c_uint]
        def raw_move(a,b): return rename(os.fsencode(a),os.fsencode(b),4)
    elif sys.platform.startswith('linux'):
        rename=libc.renameat2; rename.argtypes=[ctypes.c_int,ctypes.c_char_p,ctypes.c_int,ctypes.c_char_p,ctypes.c_uint]
        def raw_move(a,b): return rename(-100,os.fsencode(a),-100,os.fsencode(b),1)
    else: raise ValueError('Atomic no-replace move requires Linux or macOS.')
    def move(a,b):
        if raw_move(a,b)!=0: raise OSError(ctypes.get_errno(),os.strerror(ctypes.get_errno()))
    for item in items:
        a=os.path.abspath(item['src']); b=os.path.abspath(item['dest']); parent=os.path.dirname(b)
        if a in ('/',os.path.expanduser('~')) or b in ('/',os.path.expanduser('~')): raise ValueError('Cannot move or replace a filesystem root or home folder.')
        no_links(a); no_links(parent)
        if not os.path.exists(a): raise ValueError('Source no longer exists: '+a)
        if not os.path.isdir(parent): raise ValueError('Destination folder does not exist: '+parent)
        if os.path.commonpath([a,b]) in (a,b): raise ValueError('Cannot move into itself or replace an ancestor.')
        if not copying and os.stat(a).st_dev!=os.stat(parent).st_dev: raise ValueError('Move across filesystems is not supported. Use copy instead.')
    for item in items:
        a=item['src']; b=item['dest']; policy=item.get('policy'); exists=os.path.lexists(b)
        if exists and policy=='skip': skipped.append(item); continue
        if exists and policy not in ('overwrite','rename'):
            conflict={'src':item['src'],'dest':b,'directory':os.path.isdir(b)}; break
        replaced=False
        if copying:
            check_tree(a)
            stage=tempfile.mkdtemp(prefix='.herdr-upload.',dir=os.path.dirname(b)); copy_temps.append(stage)
            staged=os.path.join(stage,'payload')
            if os.path.isdir(a): shutil.copytree(a,staged,copy_function=shutil.copy2)
            else: shutil.copy2(a,staged)
            a=staged
        if policy=='rename':
            parent=os.path.dirname(b); name=os.path.basename(b); base,ext=os.path.splitext(name) if not os.path.isdir(a) else (name,'')
            for index in range(10001):
                target=b if index==0 else os.path.join(parent,base+' ('+str(index)+')'+ext)
                try: move(a,target); b=target; break
                except OSError:
                    if not os.path.lexists(target) or index==10000: raise
        elif exists and policy=='overwrite':
            check_tree(b)
            backup=tempfile.mkdtemp(prefix='.herdr-upload.',dir=os.path.dirname(b)); old=os.path.join(backup,'original')
            move(b,old)
            try: move(a,b)
            except Exception:
                try: move(old,b); os.rmdir(backup)
                except Exception as rollback: raise ValueError('Previous destination is preserved at '+old+': '+str(rollback))
                raise
            replaced=True
            done.append(dict(item,dest=b,replaced=True))
            try: shutil.rmtree(backup)
            except Exception as cleanup: raise ValueError('Move completed, but previous destination remains at '+old+': '+str(cleanup))
            continue
        else:
            try: move(a,b)
            except OSError:
                if os.path.lexists(b): conflict={'src':item['src'],'dest':b,'directory':os.path.isdir(b)}; break
                raise
        done.append(dict(item,dest=b,replaced=replaced))
except Exception as e: error=str(e)
finally:
    for stage in copy_temps:
        try: shutil.rmtree(stage)
        except Exception as cleanup: error=(error or '')+' Temporary copy remains at '+stage+': '+str(cleanup)
print(json.dumps({'completed':done,'skipped':skipped,'conflict':conflict,'error':error},ensure_ascii=False))
`;
export async function moveFiles(items, on = null, operation = "move") {
  const payload = JSON.stringify(items);
  const result = !on && window()?.platform === "windows"
    ? await windows(operation === "copy" ? "copy-items" : "move-items", [payload], {timeout:600000})
    : await exec("python3", ["-c", POSIX_MOVE, payload, operation], {on,timeout:600000});
  if (result.code !== 0) throw new Error(result.stderr || "Move failed.");
  return JSON.parse(result.stdout);
}
