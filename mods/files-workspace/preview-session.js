import { markdownBlocks } from "./markdown-blocks.js";

// No Herdr imports: owns generations and resources, independently of the UI.
export class PreviewSession {
  constructor(renderDiagrams) { this.renderDiagrams = renderDiagrams; this.revision = 0; this.blocks = []; this.closed = false; }
  async release(asset) { if (asset) await asset.dispose().catch(() => {}); }
  async update(text, colors) {
    if (this.closed) return;
    const revision = ++this.revision, previous = this.asset;
    this.asset = null; this.error = null;
    this.blocks = markdownBlocks(text);
    const diagrams = this.blocks.filter(block => block.kind === "mermaid");
    this.busy = diagrams.length > 0;
    await this.release(previous);
    if (this.closed || revision !== this.revision || !diagrams.length) return;
    try {
      const asset = await this.renderDiagrams(diagrams.map(block => block.text), colors);
      if (this.closed || revision !== this.revision) { await this.release(asset); return; }
      this.asset = asset;
      asset.items.forEach((item, i) => { if (diagrams[i]) diagrams[i].diagram = item; });
    } catch (error) {
      if (!this.closed && revision === this.revision) this.error = String(error.message || error);
    } finally {
      if (!this.closed && revision === this.revision) this.busy = false;
    }
  }
  async close() {
    this.closed = true; this.revision++; this.busy = false;
    const asset = this.asset; this.asset = null;
    await this.release(asset);
  }
}
