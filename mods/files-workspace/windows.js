// Windows implementation of the upstream mod's local operations.
// Remote commands keep using Herdr's machine routing (POSIX targets).
import { exec as nativeExec, window, appHome } from "herdr";
export const isWindows = () => window()?.platform === "windows";
// PowerShell also treats these Unicode single quotes as string delimiters.
const quote = value => "'" + String(value).replace(/['\u2018\u2019\u201a\u201b]/g, "$&$&") + "'";
export function windows(action, args = []) {
  const request = JSON.stringify({ action, args, appHome: appHome() });
  return nativeExec("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-STA", "-ExecutionPolicy", "Bypass", "-Command",
    `& ${quote(appHome() + "/mods/files-workspace/windows.ps1")} -Request ${quote(request)}; exit $LASTEXITCODE`]);
}
export async function exec(command, args = [], options = {}) {
  if (!isWindows() || options.on) return nativeExec(command, args, options);
  if (command === "sh") {
    const label = args[2], values = args.slice(3);
    const action = { clean: "clean-preview", size: "size", copy: "copy-path", move: "move",
      fetch: "download", send: "send", place: "place" }[label];
    if (action) return windows(action, values);
    if (label === "make") return windows(args[1].includes("mkdir") ? "create-folder" : "create-file", values);
    throw new Error(`Unsupported local shell operation: ${label}`);
  }
  if (command === "rm") return windows("cleanup", args.filter(a => !a.startsWith("-")));
  if (command === "mkdir") return windows("mkdir", args.filter(a => a !== "-p"));
  if (command === "mktemp") return windows("temp", [args[1]]);
  if (command === "cp") return windows("copy", args);
  if (command === "mv") return windows("move", args);
  if (command === "trash") return windows("trash", args);
  if (command === "osascript") return windows("clipboard-files");
  if (command === "defaults") return windows("language");
  if (command === "open") return windows(args[0] === "-R" ? "reveal" : "open", [args[args.length - 1]]);
  if (command === "sips") return windows(args[0] === "-s" ? "convert-image" : "image-size",
    args[0] === "-s" ? [args[3], args[5]] : [args[args.length - 1]]);
  return nativeExec(command, args, options);
}
