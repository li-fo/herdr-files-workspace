import { readTextFile, appHome, home, notify } from "herdr";
import { exec, isWindows } from "./windows.js";
import { downloadDirectory, chooseDownloadDirectory } from "./download-settings.js";
import { sshTarget, startDownload, startUpload, placeUpload } from "./file-operations.js";

export default class TransferQueue {
  constructor(strings, refresh) { this.strings = strings; this.refresh = refresh; this.jobs = []; }
  async download(path, name, dir, on, choose = false) {
    // Cancel before resolving a remote or starting a worker. Herdr persists the selection.
    const selected = choose ? await chooseDownloadDirectory(this.strings().chooseDownload) : downloadDirectory();
    if (choose && !selected) return;
    // An empty Windows destination selects the actual Windows Downloads known folder.
    const destination = selected ?? (isWindows() ? "" : `${home()}/Downloads`);
    const src = on ? `${await sshTarget(on)}:${path}` : path;
    const status = `${appHome()}/data/files-workspace/${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const r = await startDownload([src, destination, name, status, on ? "scp" : "cp", dir ? "1" : "0"]);
    if (r.code !== 0) throw new Error((r.stderr || `exit ${r.code}`).trim());
    this.jobs.push({ kind: "download", status, name, destination });
  }

  // Local files into dir on the shown folder's machine: into a temporary folder there
  // first, then into place under free names (PLACE), so nothing is overwritten.
  async upload(files, dir, on) {
    if (isWindows()) files = files.map(p => p.replaceAll("\\", "/"));
    const mk = await exec("mktemp", ["-d", `${dir}/.herdr-upload.XXXXXX`], { on });
    if (mk.code !== 0) throw new Error((mk.stderr || `exit ${mk.code}`).trim());
    const tmp = mk.stdout.trim();
    const dest = on ? `${await sshTarget(on)}:${tmp}/` : `${tmp}/`;
    const status = `${appHome()}/data/files-workspace/${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const r = await startUpload([status, on ? "scp" : "cp", dest, ...files]);
    if (r.code !== 0) {
      await exec("rm", ["-rf", "--", tmp], { on }).catch(() => {});
      throw new Error((r.stderr || `exit ${r.code}`).trim());
    }
    const name = files.length === 1 ? files[0].split("/").pop() : this.strings().items(files.length);
    this.jobs.push({ kind: "upload", status, name, tmp, dir, on });
  }

  // Finished transfers write their exit code to the status file.
  poll(cx) {
    if (!this.jobs?.length || this.polling) return;
    this.polling = true;
    cx.spawn(async cx => {
      try {
      let changed = false;
      for (const job of [...this.jobs]) {
        const code = await readTextFile(job.status).catch(() => null);
        if (code === null) continue;
        this.jobs = this.jobs.filter(j => j !== job);
        changed = true;
        const ok = code.trim() === "0";
        const log = (await readTextFile(`${job.status}.log`).catch(() => null))?.trim();
        const fail = log?.split("\n").pop() || this.strings().code(code.trim());
        if (job.kind === "download") {
          const dest = (await readTextFile(`${job.status}.dest`).catch(() => null)) || `${job.destination || `${home()}/Downloads`}/${job.name}`;
          if (ok) notify({ title: this.strings().downloaded(dest.split(/[\\/]/).pop()), body: dest.replace(home(), "~"), level: "success", timeout: 6000 });
          else notify({ title: this.strings().downloadFailed(job.name), body: fail, level: "error" });
        } else {
          let placed = false;
          try {
            if (!ok) throw new Error(fail);
            const r = await placeUpload(job.tmp, job.dir, job.on);
            if (r.code !== 0) throw new Error((r.stderr || `exit ${r.code}`).trim());
            placed = true;
            const names = r.stdout.trim().split("\n").filter(Boolean);
            notify({ title: this.strings().uploaded(names.length === 1 ? names[0] : this.strings().items(names.length)),
              body: job.on ? `${job.on}:${job.dir}` : job.dir.replace(home(), "~"), level: "success", timeout: 6000 });
          } catch (e) {
            notify({ title: this.strings().uploadFailed(job.name), body: String(e.message ?? e) + (ok ? `\nStaged files kept at ${job.tmp}` : ""), level: "error" });
          }
          if (placed || !ok) await exec("rm", ["-rf", "--", job.tmp], { on: job.on }).catch(() => {});
          this.refresh(cx);
        }
        await exec("rm", ["-f", job.status, `${job.status}.log`, `${job.status}.dest`]).catch(() => {});
      }
      if (changed) cx.notify();
      } finally { this.polling = false; }
    });
  }

}
