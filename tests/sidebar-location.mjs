import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const src=fs.readFileSync('mods/files-workspace/main.js','utf8');
let active={id:'dgx/space',active:true,machine:'dgx',folder:'/repo'};
let focus={tab:'terminal',pane:'terminal',cwd:'/repo'};
const location=vm.runInNewContext(src.slice(src.indexOf('const browseLocations ='),src.indexOf('const key ='))+'\nlocation',{
 props:()=>({}),spaces:()=>[active],focused:()=>focus,panes:()=>[{pane:'terminal',cwd:focus.cwd}],isWindows:()=>false,
 tabContext:tab=>tab==='editor'?{root:'/repo/docs/tmp',on:'dgx'}:null
});
assert.equal(location().cwd,'/repo');
// A pinned terminal from another Space must not redirect the selected file tree.
active={id:'local',active:true,machine:null,folder:'/local',tabs:[{id:'local-tab',active:true}]};
focus={space:'local',tab:'local-tab',pane:null,terminal:'remote/t9',cwd:'/remote/private'};
assert.equal(location().cwd,'/local');
assert.equal(location().on,null);
active={id:'remote-space',active:true,machine:'dgx',folder:'/remote-project',tabs:[]};
focus={pane:null,terminal:'t1',cwd:'/local'};
assert.equal(location().cwd,'/remote-project');
assert.equal(location().on,'dgx');
active={id:'dgx/space',active:true,machine:'dgx',folder:'/repo'};
focus={tab:'terminal',pane:'terminal',cwd:'/repo'};
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
