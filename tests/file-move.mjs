import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {selectionRoots} from '../mods/files-workspace/file-selection.js';
import {FileDrag} from '../mods/files-workspace/file-drag.js';
const read = name => fs.readFileSync(`mods/files-workspace/${name}.js`,'utf8').replace(/^import .*;$/gm,'').replaceAll('export ','');
const state = new Map();
const api = vm.runInNewContext(read('file-move')+'\n({planMove,matchesPath,beginMove,endMove,isMoving})',{
  selectionRoots,shared:k=>state.get(k),setShared:(k,v)=>state.set(k,v),window:()=>({platform:'windows'})
});
const items=[{path:'docs',dir:true},{path:'docs/a.md'},{path:'b.md'}];
assert.equal(api.planMove('F:/repo',items,'dest',true).length,2);
assert.equal(api.planMove('/repo',[{path:'한글.md'}],'../dest')[0].dest,'/dest/한글.md');
for (const dest of ['docs','docs/sub','DOCS/sub']) assert.throws(()=>api.planMove('F:/repo',items,dest,true),/itself/);
assert.throws(()=>api.planMove('/repo',[{path:'a/x'},{path:'b/x'}],'dest'),/same destination/);
assert.throws(()=>api.planMove('/repo',[{path:'a'}],'.'),/already/);
assert.throws(()=>api.planMove('/repo',[{path:'../a'}],'dest'),/source/);
const planned=api.planMove('F:/repo',items,'dest',true), token=api.beginMove(planned,null);
assert(api.isMoving({file:'f:/REPO/docs/a.md'}));
assert(!api.isMoving({file:'F:/repo/docs-other/a.md'}));
assert(!api.isMoving({file:'F:/repo/docs/a.md',on:'server'}));
assert.throws(()=>api.beginMove(planned,null),/running/);api.endMove('wrong');assert(api.isMoving({file:'F:/repo/b.md'}));api.endMove(token);
assert(!api.isMoving({file:'F:/repo/b.md'}));
const drag=new FileDrag();
drag.start({x:0,y:0},items,'/repo',null);drag.move({x:2,y:2},'dest');assert.equal(drag.finish('dest'),null);
drag.start({x:0,y:0},items,'/repo',null);drag.move({x:10,y:0},'dest');assert.equal(drag.finish('dest').items.length,3);assert(drag.suppressClick);
drag.start({x:0,y:0},items,'/repo',null);drag.move({x:10,y:0},'dest');drag.cancel();assert.equal(drag.finish('dest'),null);

// Pointer motion inside one target does not request repeated redraws.
drag.start({x:0,y:0},[{path:'docs/a.txt'}],'/repo',null);
assert.equal(drag.move({x:1,y:1},'dest'),false);
assert.equal(drag.move({x:8,y:0},'dest'),true);
assert.equal(drag.move({x:20,y:0},'dest'),false);
assert.equal(drag.move({x:21,y:0},'docs'),true);
assert.equal(drag.state.target,null);assert.equal(drag.finish('docs'),null);assert(drag.suppressClick);
drag.start({x:0,y:0},[{path:'docs',dir:true}],'/repo',null);
drag.move({x:10,y:0},'docs/sub');assert.equal(drag.state.target,null);drag.cancel();

let task, mutations=0, refreshed=0, closed=[], notices=[], overlay;
let moveResult=rows=>({completed:[rows[0]],error:"Second file is locked"});
const live=[{tab:'tab-a'}];
const Files=vm.runInNewContext(read('main').replace('default class Files','class Files')+'\nFiles',{
  View:class {},...api,FileDrag,selectionRoots,shared:k=>state.get(k),setShared:(k,v)=>state.set(k,v),
  TAB_KEY:'tabs',OPENING_KEY:'opening',panes:()=>live,isWindows:()=>true,
  openOverlay:value=>overlay=value,notify:n=>notices.push(n),closeDeletedFiles:files=>closed=files,
  moveFiles:async rows=>{mutations++;return moveResult(rows);}
});
const panel=new Files();Object.assign(panel,{root:'F:/repo',on:null,treeStates:new Map(),clearSelection(){},reveal(){},refresh(){refreshed++;}});
const cx={spawn:fn=>task=fn(cx),notify(){}};
const req={rootPath:panel.root,items:[{path:'a.txt'},{path:'b.txt'}],on:null};
state.set('tabs',{a:{key:'a',tab:'tab-a',file:'F:/repo/a.txt'}});
state.set('files-workspace.editor:a',{dirty:true});panel.moveItems(req,'dest',cx);assert.equal(mutations,0);
assert.match(notices.at(-1).body,/Save changes/);
state.set('files-workspace.editor:a',{dirty:false});
panel.moveItems({...req,on:'other'},'dest',cx);assert.equal(mutations,0);
panel.moveItems(req,'dest',cx);await task;
assert.equal(mutations,1);assert.equal(closed.length,1);assert.equal(closed[0].file,'F:/repo/a.txt');
assert.equal(refreshed,1);assert.equal(panel.batchBusy,false);assert(!api.isMoving({file:'F:/repo/a.txt'}));
assert.match(notices.at(-1).body,/1 moved.*Second file/);
// Destination editors are protected as well as source editors.
state.set('tabs',{b:{key:'b',tab:'tab-a',file:'F:/repo/dest/a.txt'}});
state.set('files-workspace.editor:b',{dirty:true});panel.moveItems(req,'dest',cx);assert.equal(mutations,1);
state.set('tabs',{});
moveResult=rows=>({completed:[],skipped:[],conflict:{src:rows[0].src,dest:rows[0].dest}});
panel.moveItems(req,'dest',cx);await task;
let jobToken=panel.moveJob.token;assert(overlay.props.moveConflict);assert(api.isMoving({file:'F:/repo/dest/a.txt'}));
panel.resolveMove({token:'stale',choice:'overwrite',all:true},cx);assert(panel.moveJob.conflict);
moveResult=rows=>{assert.equal(rows[0].policy,'rename');assert.equal(rows[1].policy,'rename');return {completed:rows,skipped:[]};};
panel.resolveMove({token:jobToken,choice:'rename',all:true},cx);await task;assert.equal(panel.moveJob,null);
// A new batch forgets apply-all. A one-off skip leaves the next conflict undecided.
moveResult=rows=>{assert.equal(rows[0].policy,undefined);return {completed:[],conflict:rows[0]};};
panel.moveItems(req,'dest',cx);await task;jobToken=panel.moveJob.token;
moveResult=rows=>{assert.equal(rows[0].policy,'skip');assert.equal(rows[1].policy,undefined);return {completed:[],skipped:[rows[0]],conflict:rows[1]};};
panel.resolveMove({token:jobToken,choice:'skip',all:false},cx);await task;
assert.equal(panel.moveJob.pending.length,1);assert.equal(panel.moveJob.skipped,1);
panel.resolveMove({token:jobToken,choice:'cancel'},cx);assert.equal(panel.moveJob,null);assert(!api.isMoving({file:'F:/repo/a.txt'}));


if (process.platform === 'win32') {
  const root=fs.mkdtempSync(path.join(process.cwd(),'.test-move-'));
  const src=path.join(root,"한글 ‘quote’ [src]"), dest=path.join(root,'dest');
  fs.mkdirSync(src);fs.mkdirSync(dest);fs.mkdirSync(path.join(src,'folder'));fs.writeFileSync(path.join(src,'folder','note.txt'),'keep');
  fs.writeFileSync(path.join(src,'a.txt'),'A');fs.writeFileSync(path.join(src,'b.txt'),'B');
  const invoke=(items,script="./mods/files-workspace/windows.ps1")=>{
    const request=JSON.stringify({action:'move-items',args:[JSON.stringify(items)],appHome:root});
    const quote=s=>"'"+s.replace(/['\u2018\u2019\u201a\u201b]/g,"$&$&")+"'";
    const r=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-Command',"& "+quote(script)+" -Request "+quote(request)],{encoding:'utf8',windowsHide:true});
    assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);
  };
  try {
    const batch=['a.txt','folder'].map(name=>({src:path.join(src,name),dest:path.join(dest,name)}));
    let r=invoke(batch);assert.equal(r.error,null);assert.equal(r.completed.length,2);
    assert.equal(fs.readFileSync(path.join(dest,'folder','note.txt'),'utf8'),'keep');assert(!fs.existsSync(batch[0].src));
    // Completed moves are reported before the next conflict pauses the batch.
    fs.writeFileSync(path.join(dest,'b.txt'),'existing');fs.writeFileSync(path.join(src,'c.txt'),'C');
    r=invoke(['c.txt','b.txt'].map(name=>({src:path.join(src,name),dest:path.join(dest,name)})));
    assert.equal(r.error,null);assert.equal(r.conflict.dest,path.join(dest,'b.txt'));assert.equal(r.completed.length,1);assert(!fs.existsSync(path.join(src,'c.txt')));
    assert.equal(fs.readFileSync(path.join(dest,'b.txt'),'utf8'),'existing');
    r=invoke([{src:dest,dest:path.join(dest,'folder','dest')}]);assert.match(r.error,/itself/);
    const b={src:path.join(src,'b.txt'),dest:path.join(dest,'b.txt')};
    r=invoke([{...b,policy:'skip'}]);assert.equal(r.skipped.length,1);assert(fs.existsSync(b.src));
    fs.writeFileSync(path.join(dest,'b (1).txt'),'keep numbered');
    r=invoke([{...b,policy:'rename'}]);assert.equal(r.completed[0].dest,path.join(dest,'b (2).txt'));
    assert.equal(fs.readFileSync(b.dest,'utf8'),'existing');assert.equal(fs.readFileSync(path.join(dest,'b (2).txt'),'utf8'),'B');
    fs.writeFileSync(b.src,'replacement');r=invoke([{...b,policy:'overwrite'}]);
    assert.equal(r.error,null);assert.equal(r.completed[0].replaced,true);assert.equal(fs.readFileSync(b.dest,'utf8'),'replacement');assert(!fs.existsSync(b.src));
    fs.mkdirSync(path.join(src,'folder'));fs.writeFileSync(path.join(src,'folder','new.txt'),'new');
    r=invoke([{src:path.join(src,'folder'),dest:path.join(dest,'folder'),dir:true,policy:'overwrite'}]);
    assert.equal(r.error,null);assert(fs.existsSync(path.join(dest,'folder','new.txt')));assert(!fs.existsSync(path.join(dest,'folder','note.txt')));
    // A missing source must never delete the existing destination.
    r=invoke([{...b,policy:'overwrite'}]);assert(r.error);assert.equal(fs.readFileSync(b.dest,'utf8'),'replacement');
    assert(!fs.readdirSync(dest).some(name=>name.startsWith('.herdr-upload.')));
    fs.writeFileSync(b.src,'source preserved');
    const faulty=path.join(root,'fail-publish.ps1');
    fs.writeFileSync(faulty,fs.readFileSync('mods/files-workspace/windows.ps1','utf8').replace('try { MoveFresh $src $dest }', "try { throw 'Injected publish failure' }"));
    r=invoke([{...b,policy:'overwrite'}],faulty);
    assert.match(r.error,/Injected publish failure/);assert.equal(r.completed.length,0);
    assert.equal(fs.readFileSync(b.src,'utf8'),'source preserved');assert.equal(fs.readFileSync(b.dest,'utf8'),'replacement');
    assert(!fs.readdirSync(dest).some(name=>name.startsWith('.herdr-upload.')));

  } finally {
    assert(path.resolve(root).startsWith(path.resolve(process.cwd())+path.sep));fs.rmSync(root,{recursive:true,force:true});
  }
}
console.log('PASS move planning, subtree protection, duplicate rejection, move locks, drag threshold/cancel apply-all scoping, destination editor protection, Windows conflict choices and overwrite rollback');
