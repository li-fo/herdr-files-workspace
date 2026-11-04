import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const state = new Map(), calls = [], live = [];
const source = fs.readFileSync('mods/files-transfer/file-tabs.js','utf8').replace(/^import .*;$/gm,'').replaceAll('export ','');
const api = vm.runInNewContext(source+'\n({openFile,fileKey,tabContext})', {
  shared:k=>state.get(k),setShared:(k,v)=>state.set(k,v),panes:()=>live,window:()=>({platform:'windows'}),
  run:(...args)=>calls.push(args),exec:async(cmd,args)=>{calls.push([cmd,args]);const tab='tab-'+calls.length;live.push({tab});return {code:0,stdout:JSON.stringify({tab})};}
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
