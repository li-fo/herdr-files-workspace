import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(p,'utf8').replace(/^import .*;\r?\n/gm,'').replace('export default class','class');
let stored='{broken',now=1000,calls=[];
const tabs=vm.runInNewContext(read('mods/files-workspace-agents/tabs.js')+'\n({Tabs,tabLabel})',{
 View:class{},base:{},localStorage:{getItem:()=>stored},Date:{now:()=>now},showNormal:()=>calls.push('normal'),run:n=>calls.push(n)
});
for(const bad of ['{broken','null','[]','42']){stored=bad;const t=new tabs.Tabs();t.init();assert.deepEqual(Object.keys(t.panels),[]);}
const t=new tabs.Tabs();t.init();
for(let i=0;i<19;i++)t.wheel({delta:{y:1}});
assert.equal(calls.length,0);t.wheel({delta:{y:1}});assert.deepEqual(calls,['normal','tab.prev']);
for(let i=0;i<30;i++)t.wheel({delta:{y:1}});assert.equal(calls.length,2);
now+=150;t.wheel({delta:{y:30}});assert.equal(calls.length,4);
t.wheel({delta:{y:-1},delta_lines:{y:-1}});assert.equal(calls.at(-1),'tab.next');
const lead={program:{name:'Codex',key:'codex',agent:true},title:'[Review] work',terminal:'t1'};
assert.equal(tabs.tabLabel({name:'Codex',named:false},lead),'[Review] work');
assert.equal(tabs.tabLabel({name:'My tab',named:true},lead),'My tab');
assert.equal(tabs.tabLabel({name:'legacy'},lead),'legacy');
let tasks=[],pending=[],refresh=0;
const Files=vm.runInNewContext(read('mods/files-workspace/main.js')+'\nFiles',{
 View:class{},host:{checking:()=>true},watchFolder:()=>{
  let resolve;const p=new Promise(r=>resolve=r);p.cancel=()=>{p.cancelled=true;resolve([]);};pending.push(p);return p;
 }
});
const f=new Files();f.init({},{});assert.equal(f.checkOnly,true);
const cx={spawn:fn=>tasks.push(fn(cx))};f.treeGeneration=1;f.refresh=()=>refresh++;
f.watch('/a',cx);assert.equal(pending.length,1);
f.treeGeneration++;f.stopWatch();f.watch('/b',cx);
await Promise.resolve();assert.equal(pending[0].cancelled,true);assert.equal(refresh,0);
f.closed=true;f.stopWatch();await Promise.all(tasks);assert.equal(pending[1].cancelled,true);assert.equal(refresh,0);
f.pendingWatch=Promise.resolve([]);f.stopWatch();
console.log('PASS malformed tab storage, smooth wheel, live labels, check guard, watch cancellation and legacy promises');
