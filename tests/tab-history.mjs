import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const state=new Map(), calls=[];
let spaces=[{id:'one',active:true,tabs:['agent','image','text','terminal'].map(id=>({id,active:id==='agent'}))},
 {id:'two',active:false,tabs:[{id:'other',active:true}]}];
const source=fs.readFileSync('mods/files-workspace/tab-history.js','utf8').replace(/^import .*;$/gm,'').replaceAll('export ','');
const api=vm.runInNewContext(source+'\n({recordTabVisit,selectBeforeClosing})',{
 spaces:()=>spaces,shared:key=>state.get(key),setShared:(key,value)=>state.set(key,value),run:(...args)=>calls.push(args)
});
const visit=id=>{spaces[0].tabs.forEach(tab=>tab.active=tab.id===id);api.recordTabVisit();};
visit('agent');visit('terminal');visit('text');visit('image');
api.selectBeforeClosing(new Set(['image','text']));
assert.equal(calls.at(-1)[1].id,'terminal','batch skips every deleted tab');
calls.length=0;api.selectBeforeClosing(new Set(['text']));assert.equal(calls.length,0,'background deletion preserves focus');
spaces[0].tabs=spaces[0].tabs.filter(tab=>tab.id!=='terminal');
api.selectBeforeClosing(new Set(['image','text']));assert.equal(calls.at(-1)[1].id,'agent','closed history entries are pruned');
calls.length=0;spaces[0].active=false;spaces[1].active=true;api.recordTabVisit();
api.selectBeforeClosing(new Set(['image']));assert.equal(calls.length,0,'another space never steals focus');
api.selectBeforeClosing(new Set(['other']));assert.equal(calls.length,0,'no history leaves native fallback');
spaces[0].active=true;spaces[1].active=false;visit('text');visit('image');
spaces[0].tabs.find(tab=>tab.id==='text').settled=true;
api.selectBeforeClosing(new Set(['image']));assert.equal(calls.at(-1)[1].id,'agent','settled tabs remain hidden');
console.log('PASS tab visit order, batch exclusion, background deletion, stale tabs, spaces, settled tabs and no-history fallback');
