import { exec, appHome, writeTextFile } from "herdr";
import { unlink, rmdir } from "fs/promises";

export async function renderDiagramFiles(diagrams, colors) {
  const dir = `${appHome()}/data/files-workspace/markdown/${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const request = dir + "/request.json";
  const files = [request, ...diagrams.map((_text, i) => `${dir}/diagram-${i}.svg`)];
  const dispose = async () => {
    await Promise.all(files.map(file => unlink(file).catch(() => {})));
    await rmdir(dir).catch(() => {});
  };
  try {
    await writeTextFile(request, JSON.stringify({ diagrams, colors }), null);
    const result = await exec("node", [appHome() + "/mods/files-workspace/render-diagrams.mjs", request]);
    if (result.code !== 0) throw new Error(result.stderr || "Diagram rendering failed. Node.js is required.");
    return { items: JSON.parse(result.stdout), dispose };
  } catch (error) { await dispose(); throw error; }
}
