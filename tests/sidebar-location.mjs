import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const src=fs.readFileSync('mods/files-transfer/main.js','utf8');
let active={id:'dgx/space',active:true,machine:'dgx',folder:'/repo'};
let focus={tab:'terminal',pane:'terminal',cwd:'/repo'};
const location=vm.runInNewContext(src.slice(src.indexOf('const browseLocations ='),src.indexOf('const key ='))+'\nlocation',{
 props:()=>({}),spaces:()=>[active],focused:()=>focus,panes:()=>[{pane:'terminal',cwd:focus.cwd}],isWindows:()=>false,
 tabContext:tab=>tab==='editor'?{root:'/repo/docs/tmp',on:'dgx'}:null
});
assert.equal(location().cwd,'/repo');
focus={tab:'editor',pane:'editor',cwd:null};
assert.equal(location().cwd,'/repo');
assert.equal(location().cwd,'/repo');
active={id:'other',active:true,machine:null,folder:'/other'};focus={tab:'other',pane:null,cwd:'/other'};
assert.equal(location().cwd,'/other');
active={id:'dgx/space',active:true,machine:'dgx',folder:'/repo'};focus={tab:'editor',pane:'editor'};
assert.equal(location().cwd,'/repo');
console.log('PASS existing nested file tab preserves project root, including Space round trip');

focus={tab:'terminal',pane:'terminal',cwd:'/repo/docs/tmp'};
assert.equal(location().cwd,'/repo');
