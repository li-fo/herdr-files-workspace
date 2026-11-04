import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=fs.readFileSync('mods/files-workspace/main.js','utf8');
let overlay,request,refreshes=0,takes=0;
const method=source.slice(source.indexOf('  toolbar(action, cx) {'),source.indexOf('  render(cx) {',source.indexOf('  toolbar(action, cx) {')));
const Panel=vm.runInNewContext('class Panel {'+method+'}; Panel',{
 openOverlay:x=>overlay=x,menuHeight:()=>72,MENU:()=>[],REQUEST:'request',setShared:(_k,v)=>request=v
});
const panel=new Panel();Object.assign(panel,{root:'/repo',on:'dgx01',me:'panel',refresh(){refreshes++},take(){takes++}});
panel.toolbar('delete',{});assert.equal(takes,0);
panel.toolbar('new',{});assert.equal(overlay.props.menu.path,'/repo');assert(overlay.props.menu.newOnly);
panel.selected={path:'docs/tmp',dir:true};panel.toolbar('new',{});assert.equal(overlay.props.menu.path,'/repo/docs/tmp');
panel.selected={path:'docs/tmp/note.md',dir:false};panel.toolbar('delete',{});assert.equal(request.action,'delete');assert.equal(request.path,'/repo/docs/tmp/note.md');
panel.on=null;panel.toolbar('delete',{});assert.equal(request.action,'trash');
panel.toolbar('reload',{});assert.equal(refreshes,1);
console.log('PASS toolbar selection targets, remote delete confirmation routing, local trash and refresh');
