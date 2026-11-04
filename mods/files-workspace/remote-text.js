import { exec, hc, appHome, readTextFile, writeTextFile } from "herdr";
import { unlink } from "fs/promises";

// Python is run only on the chosen POSIX machine. No daemon or permanent install.
export const REMOTE_TEXT = String.raw`
import os,sys,json,hashlib,tempfile,stat,shutil
sys.stdout.reconfigure(encoding='utf-8')
LIMIT=1024*1024
def read(path):
    if not stat.S_ISREG(os.stat(path).st_mode): raise ValueError('Not a regular text file.')
    with open(path,'rb') as f: data=f.read(LIMIT+1)
    if len(data)>LIMIT: raise ValueError('Text file exceeds 1 MiB; editing is unavailable.')
    text=data.decode('utf-8',errors='strict')
    return data,text,hashlib.sha256(data).hexdigest()
def staging(path):
    resolved=os.path.realpath(path)
    if os.path.islink(path) or os.path.dirname(resolved)!=os.path.realpath(tempfile.gettempdir()) or not os.path.basename(resolved).startswith('herdr-editor-'):
        raise ValueError('Invalid editor staging path.')
    return resolved
try:
    action=sys.argv[1]
    if action=='read':
        data,text,version=read(sys.argv[2]); print(json.dumps({'text':text,'version':version},ensure_ascii=False))
    elif action=='stage':
        print(tempfile.mkdtemp(prefix='herdr-editor-'))
    elif action=='cleanup':
        shutil.rmtree(staging(sys.argv[2]))
    elif action=='save':
        path=os.path.realpath(sys.argv[2]); expected=sys.argv[3]; stage=staging(sys.argv[4])
        original,text,version=read(path)
        if version!=expected: raise ValueError('File changed outside Herdr. Your edits are kept; reload or recover them before saving.')
        data,new_text,new_version=read(os.path.join(stage,'content'))
        mode=stat.S_IMODE(os.stat(path).st_mode)
        if not os.access(path,os.W_OK): raise PermissionError('File is not writable.')
        fd,tmp=tempfile.mkstemp(prefix='.herdr-edit-',dir=os.path.dirname(path))
        try:
            with os.fdopen(fd,'wb') as f:
                os.fchmod(f.fileno(),mode); f.write(data); f.flush(); os.fsync(f.fileno())
            if read(path)[2]!=expected: raise ValueError('File changed while saving; your edits are kept.')
            os.replace(tmp,path)
        finally:
            if os.path.exists(tmp): os.unlink(tmp)
        print(json.dumps({'version':new_version}))
    else: raise ValueError('Unknown editor operation.')
except Exception as e:
    print(str(e),file=sys.stderr); sys.exit(1)
`;
async function remote(on, ...args) {
  const result = await exec("python3", ["-c", REMOTE_TEXT, ...args], { on });
  if (result.code !== 0) throw new Error(result.stderr.trim() || "Remote text operation failed (Python 3 is required).");
  return result.stdout.trim();
}
export async function loadText(info) {
  if (!info.on) return { text: await readTextFile(info.file), version: null };
  return JSON.parse(await remote(info.on, "read", info.file));
}
export async function saveText(info, snapshot, version) {
  if (!info.on) { await writeTextFile(info.file, snapshot.raw, snapshot.expected); return null; }
  if (!version) throw new Error("Missing remote file version; reload before saving.");
  const machines = JSON.parse((await hc(["machine", "ls", "--json"])).stdout || "{}");
  const target = machines.machines?.find(m => m.name === info.on)?.target;
  if (!target) throw new Error("No SSH address for " + info.on);
  const spool = `${appHome()}/data/files-workspace/editor/${Date.now()}-${Math.random().toString(36).slice(2)}.txt`;
  let stage = null;
  try {
    await writeTextFile(spool, snapshot.raw, null);
    stage = await remote(info.on, "stage");
    const copied = await exec("scp", ["-p", "-o", "BatchMode=yes", "-o", "ConnectTimeout=15", spool, `${target}:${stage}/content`]);
    if (copied.code !== 0) throw new Error(copied.stderr || "Cannot send the edited file.");
    return JSON.parse(await remote(info.on, "save", info.file, version, stage)).version;
  } finally {
    if (stage) await remote(info.on, "cleanup", stage).catch(() => {});
    await unlink(spool).catch(() => {});
  }
}
