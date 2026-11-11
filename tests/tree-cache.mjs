import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {FileSelection} from '../mods/files-workspace/file-selection.js';
const source=fs.readFileSync('mods/files-workspace/main.js','utf8');
const body=source.slice(source.indexOf('  async loadFolder('),source.indexOf('  toggle(path, cx)'));
let loc={cwd:'F:/a',on:null};
const listings=[],git=[],tasks=[];
const proto=vm.runInNewContext('class Panel {'+body+'}; Panel.prototype',{
 isWindows:()=>true,FileSelection,location:()=>loc,key:()=>JSON.stringify(loc),TEMP:/^\.herdr-/,PER_FOLDER:500,TOTAL:5000,
 directory:path=>new Promise((resolve,reject)=>listings.push({path,resolve,reject})),
 exec:()=>new Promise(resolve=>git.push(resolve)),addGitMark(){}
});
const panel=Object.assign(Object.create(proto),{treeStates:new Map(),folders:new Set(),entries:new Map(),show(){},watch(){}});
let notifications=0;
const cx={spawn(fn){tasks.push(fn(cx));},notify(){notifications++;}};
const tick=async()=>{for(let i=0;i<8;i++) await Promise.resolve();};
panel.refresh(cx);
listings.shift().resolve([{name:'cached.txt',dir:false}]);await tick();
assert.equal(panel.entries.get('')[0].name,'cached.txt');
assert(notifications>0,'root list is published before Git resolves');
assert.equal(panel.loading,true);
loc={cwd:'F:/b',on:null};panel.refresh(cx);
assert.equal(listings[0].path,'F:/b','switch does not wait for old Git query');
loc={cwd:'F:/a',on:null};panel.refresh(cx);
assert.equal(panel.entries.get('')[0].name,'cached.txt','return restores entries synchronously');
const b=listings.shift(),a=listings.shift();
b.resolve([{name:'wrong.txt',dir:false}]);await tick();
assert.equal(panel.entries.get('')[0].name,'cached.txt');
assert.equal(panel.loading,true,'old finally cannot clear current loading');
git.shift()({code:1});await tick();
assert.equal(panel.loading,true,'old A completion cannot clear new A loading');
a.resolve([{name:'fresh.txt',dir:false}]);await tick();
assert.equal(panel.entries.get('')[0].name,'fresh.txt');
git.shift()({code:1});await Promise.all(tasks);
assert.equal(panel.loading,false);

// Return to the same path before its older directory query finishes.
loc={cwd:'F:/c',on:null};panel.refresh(cx);const oldC=listings.shift();
loc={cwd:'F:/d',on:null};panel.refresh(cx);const oldD=listings.shift();
loc={cwd:'F:/c',on:null};panel.refresh(cx);const newC=listings.shift();
oldC.resolve([{name:'stale.txt',dir:false}]);oldD.resolve([]);await tick();
assert.equal(panel.entries.size,0,'generation rejects stale same-path results');
newC.resolve([{name:'current.txt',dir:false}]);await tick();
git.shift()({code:1});await Promise.all(tasks);
assert.equal(panel.entries.get('')[0].name,'current.txt');
// Hold both watcher/timer refreshes and already-running directory responses during dragging.
panel.drag={state:{active:true},cancel(){this.state=null;}};
const before=notifications;
panel.refresh(cx);panel.refresh(cx);assert.equal(listings.length,0);assert(panel.refreshDeferred);
panel.drag.state=null;panel.resumeTree(cx);assert.equal(listings.length,1);
panel.drag.state={active:true};listings.shift().resolve([{name:'during-drag.txt',dir:false}]);await tick();
assert.equal(panel.entries.get('')[0].name,'current.txt');assert.equal(notifications,before);
assert.equal(panel.loading,false);assert(panel.refreshDeferred);
panel.drag.state=null;panel.resumeTree(cx);panel.resumeTree(cx);assert.equal(listings.length,1);
listings.shift().resolve([{name:'after-drag.txt',dir:false}]);await tick();git.shift()({code:1});await Promise.all(tasks);
assert.equal(panel.entries.get('')[0].name,'after-drag.txt');assert.equal(panel.refreshDeferred,false);
const idle={spawn(){}};
for(let i=0;i<20;i++){loc={cwd:`F:/cache-${i}`,on:null};panel.refresh(idle);}
assert(panel.treeStates.size<=12,'inactive caches are bounded');
console.log('PASS immediate cache restore, root before Git, context switching, stale A/B/A results and bounded caches');

// Reopening keeps cached rows visible while validating, and rapid toggles share one read.
const toggleBody=source.slice(source.indexOf('  toggle(path, cx) {'),source.indexOf('  show(path, cx) {'));
const Toggle=vm.runInNewContext('class Toggle {'+toggleBody+'}; Toggle', {key:()=>JSON.stringify(loc)});
let completeRead, reads=0, toggleTask;
const toggler=Object.assign(new Toggle(),{folders:new Set(['docs']),entries:new Map([['docs',[{name:'cached.md'}]]]),
  pending:new Set(),context:JSON.stringify(loc),treeGeneration:1,
  loadFolder(){reads++;return new Promise(resolve=>completeRead=resolve);}});
const toggleCx={notify(){},spawn(fn){toggleTask=fn(toggleCx);}};
toggler.toggle('docs',toggleCx);assert(toggler.entries.has('docs'));
toggler.toggle('docs',toggleCx);assert.equal(toggler.entries.get('docs')[0].name,'cached.md');assert(toggler.pending.has('docs'));
toggler.toggle('docs',toggleCx);toggler.toggle('docs',toggleCx);assert.equal(reads,1);
completeRead();await toggleTask;assert.equal(toggler.pending.size,0);
console.log('PASS collapse/reopen retains cached rows and deduplicates rapid reopen reads');

// Mouse-down without an actual drag must not discard a first folder read.
const clickPanel=Object.assign(Object.create(proto),{root:loc.cwd,on:loc.on,context:JSON.stringify(loc),treeGeneration:1,
  folders:new Set(['fresh']),entries:new Map(),drag:{state:{active:false}},pending:new Set()});
let reading=clickPanel.loadFolder('fresh',clickPanel.context);
listings.shift().resolve([{name:'first.md',dir:false}]);await reading;
assert.equal(clickPanel.entries.get('fresh')[0].name,'first.md');
assert(!clickPanel.refreshDeferred);
// Real dragging defers publication, but keeps the completed response for immediate replay.
clickPanel.drag.state.active=true;
reading=clickPanel.loadFolder('fresh',clickPanel.context);
listings.shift().resolve([{name:'updated.md',dir:false}]);await reading;
assert.equal(clickPanel.entries.get('fresh')[0].name,'first.md');
assert.equal(clickPanel.deferredListings.size,1);
clickPanel.drag.state=null;clickPanel.resumeTree(cx);
assert.equal(clickPanel.entries.get('fresh')[0].name,'updated.md');assert.equal(listings.length,0);
// Only an actual I/O failure records a folder error; retry clears it.
reading=clickPanel.loadFolder('fresh',clickPanel.context);
listings.shift().reject(Error('Access denied'));await assert.rejects(reading,/Access denied/);
assert.equal(clickPanel.folderErrors.get('fresh'),'Access denied');
reading=clickPanel.loadFolder('fresh',clickPanel.context);
assert(!clickPanel.folderErrors.has('fresh'));listings.shift().resolve([]);await reading;
assert.equal(clickPanel.entries.get('fresh').length,0);
console.log('PASS ordinary click results, deferred response replay without reread, and genuine folder error/retry state');
