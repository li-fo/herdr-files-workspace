import { shared, setShared, pickFolder } from "herdr";

// Local destination shared by all Files Transfer panels and persisted by Herdr.
const KEY = "files-workspace.download-directory";
export function downloadDirectory() {
  const value = shared(KEY);
  return typeof value === "string" && value.trim() ? value : null;
}
export async function chooseDownloadDirectory(prompt) {
  const folder = await pickFolder({ prompt });
  if (!folder) return null;
  setShared(KEY, folder);
  return folder;
}
