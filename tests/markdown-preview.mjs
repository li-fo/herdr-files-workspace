import assert from 'node:assert/strict';
import {markdownBlocks} from '../mods/files-workspace/markdown-blocks.js';
import {render} from '../mods/files-workspace/vendor/pele.mjs';
import {nativeSvg} from '../mods/files-workspace/render-diagrams.mjs';
assert.deepEqual(markdownBlocks('# Title\n\n```mermaid\nflowchart LR\n A-->B\n```\nText').map(b=>b.kind),['markdown','mermaid','markdown']);
assert.equal(markdownBlocks('````text\n```mermaid\nA-->B\n```\n````')[0].kind,'markdown');
assert.equal(markdownBlocks('~~~mermaid\nflowchart LR\n A-->B\n~~~')[0].kind,'mermaid');
assert.equal(markdownBlocks('```mermaid\nunclosed')[0].kind,'markdown');
for (const source of ['flowchart LR\n A[한글] --> B[Preview]','sequenceDiagram\n Alice->>Bob: Hello','classDiagram\n Animal <|-- Duck','stateDiagram-v2\n [*] --> Ready','erDiagram\n CUSTOMER ||--o{ ORDER : places','pie\n "A" : 30\n "B" : 70']) {
 const result=render(source,{responsive:false,links:false,images:false});
 const svg=nativeSvg(result.svg,{'--pele-fg':'#ffffff'});
 assert(!svg.includes('var('));assert(result.width>0 && result.height>0);assert(svg.startsWith('<svg'));
}
assert.throws(()=>render('flowchart LR\n A['));
console.log('PASS Markdown fences, six diagram families, Korean text, native SVG colors and invalid-syntax errors');
