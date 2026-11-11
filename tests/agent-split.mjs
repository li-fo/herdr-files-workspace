import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
const path='mods/files-workspace-agents/';
const read=name=>fs.readFileSync(path+name,'utf8').replace(/^\uFEFF/,'');
const split=await import('data:text/javascript;base64,'+Buffer.from(read('split.js')).toString('base64'));
const {STACK,SPLIT,KEY,find,state,leaves,withSplit,withoutSplit,isSplit,returnToTab,editTree,captureSizes,visibleTerminals}=split;
const plain=x=>JSON.parse(JSON.stringify(x));
const main={id:'main',type:'block',content:{tab:'active',pane:{header:{height:30}}}};
const root={id:'root',type:'row',children:[{id:STACK,type:'stack',active:'main',children:[main]},{id:'files',content:{mod:'files-workspace'}}]};
const picks=[{address:'frontend/t1',name:'A',machine:'frontend'},{address:'dgx01/t2',name:'B',machine:'dgx01'},{address:'t3',name:'C',machine:null},{address:'t4',name:'D',machine:null}];
let saved=state({open:true,picks:picks.slice(0,2)});
assert.equal(saved.version,2);assert.deepEqual(leaves(saved.tree).map(n=>n.id),['0','1']);
let opened=withSplit(root,saved);
assert.equal(find(root,STACK).children.length,1);
assert.deepEqual(find(opened,'main'),main);assert.deepEqual(find(opened,'files'),find(root,'files'));
assert.deepEqual(withoutSplit(opened),root);
assert.throws(()=>withSplit(root,[picks[0],picks[0]]));
assert.throws(()=>withSplit({id:'other'},saved));
assert.equal(returnToTab({space:'A',tab:'a'},{space:'B',tab:'b'}),true);
assert.equal(returnToTab({space:'A',tab:'a'},{space:'B',tab:'b'},true),false);
assert.equal(returnToTab(undefined,{space:'B',tab:'b'}),false);
assert.equal(returnToTab({space:'A',tab:'a'},{space:'A',tab:'b'},true),true);
assert.equal(returnToTab({space:'A',tab:'a'},{space:'A',tab:'b'}),true);
// Dragged ratios survive zoom, edits, and restoration, including mixed levels.
find(opened,'fw-agent-0').size.weight=3;
saved=captureSizes(saved,opened);
assert.deepEqual(saved.tree.weights,[3,1]);
const zoomed=editTree(saved,'zoom','1');
assert.deepEqual(visibleTerminals(withSplit(root,zoomed)),[picks[1].address]);
assert.deepEqual(captureSizes(zoomed,withSplit(root,zoomed)).tree.weights,[3,1]);
assert.deepEqual(editTree(zoomed,'zoom','1'),saved);
const swapped=editTree(saved,'swap','0','1');
assert.deepEqual(leaves(swapped.tree).map(n=>n.id),['1','0']);
assert.deepEqual(swapped.tree.weights,[3,1]);
let mixed=editTree(saved,'add-below','1',picks[2]);
assert.equal(mixed.tree.axis,'row');assert.equal(mixed.tree.children[1].axis,'column');
mixed=editTree(mixed,'add-right',leaves(mixed.tree)[2].id,picks[3]);
assert.equal(leaves(mixed.tree).length,4);
assert.deepEqual(visibleTerminals(withSplit(root,mixed)),picks.map(p=>p.address));
assert.throws(()=>editTree(mixed,'add-right','0',picks[1]));
const unchanged=plain(mixed);
const target=leaves(mixed.tree)[3].id;
const replace=editTree(mixed,'replace',target,{address:'other/t8',name:'Other'});
assert.equal(leaves(replace.tree)[3].id,target);
assert.deepEqual(mixed,unchanged);
for(const item of leaves(mixed.tree)) mixed=editTree(mixed,'remove',item.id);
assert.equal(mixed.tree,null);assert.equal(mixed.open,false);
console.log('PASS migration, stable IDs, mixed splits, swap, ratio capture, zoom, replace, removal and input immutability');

// Host integration: never spawn/kill/adopt/move sessions, and navigate to exact source pane.
let current=root,store=null,calls=[],messages=[],liveAgents=[],liveSpaces=[],livePanes=[];
const actions=read('actions.js').replace(/^import .*;\r?\n/gm,'').replaceAll('export function ','function ').replaceAll('export async function ','async function ');
const api=vm.runInNewContext(actions+'\n({showSplit,closeSplit,showNormal,changeView,goToSpace})',{
 ...split,layout:()=>current,shared:()=>store,spaces:()=>liveSpaces,panes:()=>livePanes,agents:()=>liveAgents,
 setShared:(key,value)=>{assert.equal(key,KEY);store=value;},
 exec:async (cmd,args)=>{assert.equal(cmd,'herdr-app');assert.equal(args[1],'layout.set');current=JSON.parse(args[2]).layout;return {code:0,stdout:'{"ok":true}'};},
 run:(name,args)=>{calls.push([name,plain(args)]);if(name==='layout.set')current=args.layout;
  if(name==='layout.select')find(current,args.stack).active=args.child;},
 openOverlay:()=>{},notify:n=>messages.push(n)
});
assert.equal(await api.showSplit(picks.slice(0,3),'column'),true);
const ids=leaves(state(store).tree).map(n=>n.id);
assert.equal(state(store).tree.axis,'column');
assert.equal(await api.changeView('zoom',ids[1]),true);
assert.equal(api.goToSpace(ids[1]),false);
assert.ok(isSplit(current),'failed navigation must keep the view');
liveAgents=[{address:picks[1].address,space:'source-space'}];
liveSpaces=[{id:'source-space'}];
livePanes=[{terminal:picks[1].address,tab:'exact-tab',pane:'exact-pane'}];
const before=plain(store);calls=[];
assert.equal(api.goToSpace(ids[1]),true);
assert.deepEqual(calls.map(c=>c[0]),['layout.select','space.select','tab.select','pane.focus']);
assert.deepEqual(calls[2][1],{id:'exact-tab'});assert.deepEqual(calls[3][1],{pane:'exact-pane'});
assert.deepEqual(plain(store),before);assert.ok(!isSplit(current));
await api.showSplit();assert.ok(isSplit(current));assert.equal(store.zoom,ids[1]);
await api.changeView('remove',ids[0]);assert.equal(store.zoom,null);
await api.closeSplit();assert.deepEqual(plain(current),root);
assert.ok(calls.every(([name])=>!['terminal.kill','terminal.open','terminal.keep','pane.close','tab.close','tab.new','pane.split'].includes(name)));
console.log('PASS source navigation, missing-source safety, retained overview, zoom return, and non-destructive lifecycle');

// Deferred UI: exercise selection, single-item actions and dynamic tab focus.
class Element { constructor(){this.nodes=[];this.events={};} }
function element(){let proxy;const target=new Element();proxy=new Proxy(target,{get(t,key){
 if(key in t)return t[key];return (...args)=>{
  if(key==='id')t.identity=args[0];if(key==='child')t.nodes.push(args[0]);if(key==='children')t.nodes.push(...args[0]);
  if(key==='when'&&args[0])args[1](proxy);
  if(key==='on_click')t.events.click=args[0];if(key==='on_mouse_up')t.events.mouse_up=args[1];return proxy;
 };
}});return proxy;}
function node(tree,id){if(tree?.identity===id)return tree;for(const child of tree?.nodes||[]){const n=node(child,id);if(n)return n;}}
let properties={role:'picker',mode:'create',overlay:'picker'},selected,closed=false;
const agentList=picks.map((p,i)=>({...p,space:'space'+i,space_name:p.name,status:'idle'}));
const source=read('main.js').replace(/^import .*;\r?\n/gm,'').replace('export default class','class');
const cx={stop_propagation(){},notify(){}};
const uiHost={Tabs:class{},div:element,h_flex:element,v_flex:element,
 props:()=>properties,agents:()=>agentList,spaces:()=>[],shared:()=>store,
 state,leaves,KEY,MOD:split.MOD,theme:()=>({}),terminals:()=>[],
 request:(action,args)=>{selected={action,...args};return true;},closeOverlay:()=>{closed=true;},
 changeView:(action,id,payload)=>{selected={action,id,payload};return true;},goToSpace:()=>{},openOverlay:()=>{}};
const Picker=vm.runInNewContext(source+'\nAgentWorkspace',uiHost);
store=null;const picker=new Picker();picker.init({},{});
for(const pick of picks)node(picker.render(cx),'choose-'+pick.address).events.click({},cx);
node(picker.render(cx),'initial-column').events.click({},cx);
node(picker.render(cx),'apply-agents').events.click({},cx);
assert.equal(selected.picks.length,4);assert.equal(selected.axis,'column');assert.ok(closed);
store=saved;properties={role:'picker',mode:'swap',target:'0'};
const swapPicker=new Picker();swapPicker.init({},{});
node(swapPicker.render(cx),'choose-1').events.click({},cx);
node(swapPicker.render(cx),'apply-agents').events.click({},cx);
assert.deepEqual(plain(selected),{action:'swap',target:'0',payload:'1'});
properties={role:'header',view:'0',address:picks[0].address};
assert.ok(node(swapPicker.render(cx),'zoom-agent'));
properties={role:'menu',target:'0'};assert.ok(node(swapPicker.render(cx),'go-to-space'));
properties={role:'view-settings',overlay:'settings'};
uiHost.run=command=>{selected=command;};
node(swapPicker.render(cx),'keep-on-space-change').events.click({},cx);
assert.equal(selected,split.MOD+'.toggle-follow');
let activeSpace={id:'A',active:true,tabs:[{id:'a',active:true,name:'a'}]};
let focus={pane:null,terminal:picks[0].address},normalCalls=0,focusCalls=[];
let tabLayout=opened,keepOnSpaceChange=true;
const tabsSource=read('tabs.js').replace(/^import .*;\r?\n/gm,'').replace('export default class','class');
const TabController=vm.runInNewContext(tabsSource+'\nTabs',{
 View:class{},div:element,svg:element,image:element,h_flex:element,
 base:{},localStorage:{getItem:()=>null,setItem:()=>{}},
 spaces:()=>[activeSpace],panes:()=>[],focused:()=>focus,
 layout:()=>tabLayout,shared:key=>key===KEY?saved:key===KEY+'.keep-on-space-change'?keepOnSpaceChange:[],theme:()=>({}),window:()=>({}),settings:()=>({zoom:1}),
 KEY,MOD:split.MOD,state,isSplit,returnToTab,visibleTerminals,showNormal:()=>normalCalls++,
 run:(command,args)=>focusCalls.push([command,args]),openOverlay:()=>{},request:()=>{},choose:()=>{}
});
const bar=new TabController();bar.init();bar.render();
assert.equal(focusCalls.at(-1)[0],'pane.focus');
activeSpace={id:'B',active:true,tabs:[{id:'b',active:true,name:'b'}]};focus={pane:'hidden',terminal:'hidden-terminal'};
bar.render();assert.equal(normalCalls,0);assert.equal(focusCalls.at(-1)[1].terminal,picks[0].address);
tabLayout=withSplit(root,zoomed);bar.render();assert.equal(focusCalls.at(-1)[1].terminal,picks[1].address);
node(bar.render(),'tab-b').events.mouse_up();assert.equal(normalCalls,1);
activeSpace.tabs=[{id:'new-tab',active:true,name:'new'}];bar.render();assert.equal(normalCalls,2);
keepOnSpaceChange=false;
const beforeFocus=focusCalls.length, beforeState=JSON.stringify(saved);
activeSpace={id:'C',active:true,tabs:[{id:'c',active:true,name:'c'}]};
bar.render();assert.equal(normalCalls,3);
assert.equal(focusCalls.length,beforeFocus,'do not focus a hidden Agents View after switching Space');
assert.equal(JSON.stringify(saved),beforeState,'returning to workspace preserves the overview');
console.log('PASS multi-picker, swap picker, deferred header/menu, variable-size focus, Space persistence and ordinary-tab return');
// A persistent tab copy owns async changes. Popups enqueue before closing.
const values=new Map([[KEY,plain(saved)]]);let failCli=false,attempts=0;
const queued=vm.runInNewContext(actions+'\n({request,applyRequest,resetRequests})',{
 ...split,layout:()=>root,shared:key=>values.get(key),setShared:(key,value)=>values.set(key,value),
 spaces:()=>[],panes:()=>[],agents:()=>[],run:()=>{},notify:()=>{},openOverlay:()=>{},
 exec:async()=>{attempts++;return failCli?{code:1,stderr:'rejected'}:{code:0,stdout:'{"ok":true}'};}
});
assert.equal(queued.request('show',{picks}),true);
assert.equal(queued.request('close'),false,'reject overlapping edits');
await queued.applyRequest();
assert.equal(attempts,1);
assert.equal(typeof values.get(KEY).tree,'string','deep state crosses host bridge as JSON');
const retained=plain(values.get(KEY));failCli=true;
assert.equal(queued.request('close'),true);await queued.applyRequest();
assert.deepEqual(plain(values.get(KEY)),retained,'failed CLI update keeps saved arrangement');
assert.equal(values.get(KEY+'.busy'),false,'failure releases busy flag');
console.log('PASS serialized async requests, host-depth-safe state and failed-layout preservation');
