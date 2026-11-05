import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const state = new Map(), calls = [], live = [];
const source = fs.readFileSync('mods/files-workspace/file-tabs.js','utf8').replace(/^import .*;$/gm,'').replaceAll('export ','');
const api = vm.runInNewContext(source+'\n({openFile,fileKey,tabContext,closeDeletedFileTabs})', {
  shared:k=>state.get(k),setShared:(k,v)=>state.set(k,v),panes:()=>live,window:()=>({platform:'windows'}),
  notify:()=>{},selectBeforeClosing:()=>{},
  run:(...args)=>calls.push(args),exec:async(cmd,args)=>{const info=JSON.parse(args.at(-1));const doc=info.document || info.viewer;assert.equal(state.get('files-workspace.opening-tab')[doc.space].root,doc.root);calls.push([cmd,args]);const tab='tab-'+calls.length;live.push({tab});return {code:0,stdout:JSON.stringify({tab})};}
});
const file={space:'space-1',on:null,root:'F:/work',file:"F:/work/한글 ' note.md"};
await Promise.all([api.openFile(file),api.openFile(file)]);
assert.equal(calls.length,1);assert.equal(api.tabContext(live[0].tab).root,file.root);
await api.openFile({...file,file:file.file.toUpperCase()});assert.equal(calls.at(-1)[0],'tab.select');
await api.openFile({...file,on:'server'});assert.equal(calls.at(-1)[0],'herdr-app');
const args=calls.at(-1)[1];assert.equal(JSON.parse(args.at(-1)).document.on,'server');
await api.openFile({...file,file:'F:/work/image.png'});assert(JSON.parse(calls.at(-1)[1].at(-1)).viewer);
live.splice(0);await api.openFile(file);assert.equal(calls.at(-1)[0],'herdr-app');
console.log('PASS file tab deduplication, Windows path identity, pinned folder/machine, image viewer routing and reopening closed tabs');

assert.equal(Object.keys(state.get('files-workspace.opening-tab')).length,0);

const lastTab=live[0].tab;
await api.openFile({...file,root:'F:/'});
assert.equal(api.tabContext(lastTab).root,'F:/');

const registry = {
 a:{tab:'a',file:'F:/work/docs/a.md',on:null},
 b:{tab:'b',file:'F:/work/docs/sub/b.png',on:null},
 c:{tab:'c',file:'F:/work/docs-other/c.md',on:null},
 d:{tab:'d',file:'F:/work/docs/a.md',on:'server'},
 e:{tab:'e',file:'F:/work/docs/a.md',on:null,space:'other-space'},
 stale:{tab:'gone',file:'F:/work/docs/a.md',on:null},
};
state.set('files-workspace.file-tabs',registry);
live.splice(0,live.length,...['a','b','c','d','e'].map(tab=>({tab})));
calls.length=0;api.closeDeletedFileTabs('f:\\WORK\\docs\\a.md');
assert.deepEqual(calls.map(x=>x[1].id),['a','e']);
assert(calls.every(x=>x[0]==='tab.close' && !x[1].confirmed));
calls.length=0;api.closeDeletedFileTabs('F:/work/docs/',null,true);
assert.deepEqual(calls.map(x=>x[1].id),['a','b','e']);
calls.length=0;api.closeDeletedFileTabs('F:/work/docs/a.md','server');
assert.deepEqual(calls.map(x=>x[1].id),['d']);
calls.length=0;api.closeDeletedFileTabs('F:/WORK/docs/a.md','server');
assert.equal(calls.length,0,'remote path matching is case sensitive');
live.push({tab:'a',terminal:'terminal'});
api.closeDeletedFileTabs('F:/work/docs/a.md');
assert.deepEqual(calls.map(x=>x[1].id),['e'],'split tabs must not terminate other panes');
console.log('PASS deleted file/folder tabs, Windows normalization, machine isolation, other spaces and stale tabs');
