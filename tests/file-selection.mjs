import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {FileSelection, visibleFiles, selectionRoots} from '../mods/files-workspace/file-selection.js';
const entries=new Map([['',[{name:'docs',dir:true},{name:'z.md',dir:false}]],['docs',[{name:'a.md',dir:false},{name:'b.md',dir:false},{name:'c.md',dir:false}]]]);
const folders=new Set(['docs']), visible=visibleFiles(entries,folders), s=new FileSelection();
const paths=()=>[...s.items.keys()];
s.click(visible[1],visible); s.click(visible[3],visible,{shift:true});
assert.deepEqual(paths(),['docs/a.md','docs/b.md','docs/c.md']);
s.click(visible[2],visible,{control:true});assert.deepEqual(paths(),['docs/a.md','docs/c.md']);
s.click(visible[4],visible,{control:true,shift:true});assert.deepEqual(new Set(paths()),new Set(['docs/a.md','docs/b.md','docs/c.md','z.md']));
s.clear();s.click(visible[3],visible);s.click(visible[1],visible,{shift:true});assert.equal(s.items.size,3);
s.remove('docs');assert.equal(s.items.size,0);assert.equal(s.anchor,null);
s.click(visible[4],visible,{shift:true});assert.deepEqual(paths(),['z.md']);
s.click(visible[4],visible,{platform:true});assert.equal(s.items.size,0);
assert.deepEqual(selectionRoots(visible).map(x=>x.path),['docs','z.md']);
assert.deepEqual(visibleFiles(entries,new Set()).map(x=>x.path),['docs','z.md']);

const source=fs.readFileSync('mods/files-workspace/main.js','utf8').replace(/^import .*;$/gm,'').replace('export default class Files','class Files');
let overlay, clipboard, task, calls=[], refreshes=0, failedPath=null;
const closedFiles=[];
const values=new Map();
const Files=vm.runInNewContext(source+'\nFiles',{
 props:()=>({}),downloadDirectory:()=>null,View:class {},FileSelection,visibleFiles,selectionRoots,
 shared:k=>values.get(k),setShared:(k,v)=>values.set(k,v),
 openOverlay:x=>overlay=x,notify(){},home:()=>'/home',isWindows:()=>true,relativePath:(p,root)=>p.slice(root.length+1),
 closeDeletedFileTabs:(...args)=>closedFiles.push(args),
 closeDeletedFiles:(items,on)=>items.forEach(item=>closedFiles.push([item.file,on,item.directory])),
 exec:async (...args)=>{calls.push(args);return {code:args[1].includes(failedPath)?1:0,stderr:'test failure'};}
});
const panel=new Files();Object.assign(panel,{root:'/repo',projectRoot:'/repo',on:null,entries,folders,selection:new FileSelection(),me:'panel',refresh(){refreshes++;},keys:{focus(){}}});
panel.select('docs/a.md',false);panel.select('docs/b.md',false,{control:true});
assert.equal(panel.selectedItems().length,2);
panel.openMenu('docs/a.md',false);assert.equal(overlay.props.menu.items.length,2);
const cx={spawn(fn){task=fn(cx);},notify(){},write_to_clipboard:text=>clipboard=text};
let req={items:visible,rootPath:'/repo',on:null,from:'panel',action:'copy'};
panel.takeSelection(req,cx);await task;assert.equal(clipboard,visible.map(x=>'/repo/'+x.path).join('\n'));
panel.takeSelection({...req,action:'delete'},cx);assert.equal(calls.length,0);assert.equal(overlay.props.confirm.items.length,5);
panel.takeSelection({...req,action:'delete-yes'},cx);await task;
assert.deepEqual(calls.map(x=>x[1][0]),['/repo/docs','/repo/z.md']);assert.equal(refreshes,1);
assert.deepEqual(closedFiles.map(x=>x[0]),['/repo/docs','/repo/z.md']);
closedFiles.length=0;failedPath='/repo/z.md';
panel.takeSelection({...req,action:'delete-yes'},cx);await task;
assert.deepEqual(closedFiles.map(x=>x[0]),['/repo/docs'],'failed deletion does not close its tab');
failedPath=null;
calls=[];panel.on='server';panel.takeSelection({...req,on:'server',action:'delete-yes'},cx);await task;
assert.equal(calls[0][0],'rm');assert.equal(calls[0][2].on,'server');
calls=[];panel.takeSelection({...req,action:'delete-yes'},cx);assert.equal(calls.length,0,'stale machine request rejected');
panel.clearSelection();assert.equal(panel.selected,null);assert.equal(panel.selection.items.size,0);
for (const action of ['trash','delete-yes']) {
  closedFiles.length=0;
  const request={id:action,from:'panel',action,path:'/repo/z.md',name:'z.md',dir:false,on:action==='trash'?null:'server'};
  values.set('files-workspace.request',request);panel.take(cx);await task;
  assert.equal(closedFiles.length,1,`${action} closes the deleted file tab`);
  closedFiles.length=0;failedPath=request.path;
  values.set('files-workspace.request',{...request,id:action+'-failed'});panel.take(cx);await task;
  assert.equal(closedFiles.length,0,`${action} failure keeps the tab`);failedPath=null;
}
console.log('PASS Ctrl/Shift ranges, toggle, visible order, ancestor deduplication, menu snapshot, path copy, confirmed local/remote batches and stale-context rejection');

// Exercise the actual row callbacks with public ClickEvent modifier fields.
const nodes=[];
function element() {
 const handlers={};
 const node=new Proxy({handlers},{get(target,name){if(name==='handlers')return handlers;return (...args)=>{
  if(name==='on_click')handlers.click=args[0];
  if(name==='on_mouse_down')handlers[args[0]+'Down']=args[1];
  if(name==='when' && args[0])args[1](node);
  return node;
 };}});nodes.push(node);return node;
}
const RowFiles=vm.runInNewContext(source+'\nFiles',{
 View:class {},FileSelection,visibleFiles,selectionRoots,h_flex:element,div:element,svg:element,image:element,
 gitMark:()=>null,ICONS:{file:'file',folder:'folder',folderNames:{},fileNames:{},fileExtensions:{}},
});
const rowsPanel=new RowFiles();Object.assign(rowsPanel,{entries:new Map([['',[{name:'a.txt',dir:false},{name:'b.txt',dir:false}]]]),folders:new Set(),root:'/repo',marks:{},selection:new FileSelection(),keys:{focus(){}}});
let opened=0;rowsPanel.openTab=()=>opened++;rowsPanel.openMenu=()=>{};
const rows=rowsPanel.rows('',0,[],{selected:'#fff'},true);
const clickCx={stop_propagation(){},notify(){}};
rows[0].handlers.click({modifiers:{control:true}},clickCx);
rows[1].handlers.click({modifiers:{shift:true}},clickCx);
assert.equal(rowsPanel.selection.items.size,2);assert.equal(opened,0);
rows[0].handlers.rightDown({},clickCx);assert.equal(rowsPanel.selection.items.size,2);
rows[1].handlers.click({modifiers:{}},clickCx);assert.equal(rowsPanel.selection.items.size,1);assert.equal(opened,1);
console.log('PASS row modifier clicks select without opening, right-click preserves group, ordinary click opens');
