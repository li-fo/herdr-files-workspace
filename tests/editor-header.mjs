import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const values=new Map();let writes=0;
const source=fs.readFileSync('mods/files-workspace/document.js','utf8').replace(/^import .*;$/gm,'').replace('export function','function').replace('export default class','class');
const Document=vm.runInNewContext(source+'\nDocument',{isMoving:()=>false,shared:k=>values.get(k),setShared:(k,v)=>{values.set(k,v);writes++;}});
const doc=new Document();Object.assign(doc,{info:{key:'file-a'},headerToken:'instance-a',buffer:{dirty:true}});
doc.publishHeader();const count=writes;doc.publishHeader();assert.equal(writes,count);
assert.equal(values.get('files-workspace.editor:file-a').dirty,true);
let saves=0,reloads=0;doc.save=()=>saves++;doc.reload=()=>reloads++;
values.set('files-workspace.editor-action:file-a',{token:'other-instance',action:'save',id:1});doc.takeHeader({});assert.equal(saves,0);
values.set('files-workspace.editor-action:file-a',{token:'instance-a',action:'save',id:2});doc.takeHeader({});doc.takeHeader({});assert.equal(saves,1);
values.set('files-workspace.editor-action:file-a',{token:'instance-a',action:'reload',id:3});doc.takeHeader({});assert.equal(reloads,1);
doc.discardArmed=true;doc.publishHeader();assert.equal(values.get('files-workspace.editor:file-a').discard,true);
console.log('PASS targeted header actions, stale-instance rejection, reload confirmation state and deduplicated status updates');

const fresh=new Document();fresh.load=()=>{};
fresh.init({key:'fresh',file:'/repo/note.md'},{focus_handle(){return {};},timer:{every(){}},spawn(){}});
assert.equal(fresh.markdown,true);assert.equal(fresh.previewMode,false);
fresh.buffer={text:'unsaved text',dirty:true};fresh.editor={identity:'same-editor'};
let prepared=0;fresh.preparePreview=()=>prepared++;
fresh.togglePreview({notify(){}});assert(fresh.previewMode);assert.equal(prepared,1);
fresh.togglePreview({notify(){}});assert(!fresh.previewMode);assert.equal(fresh.buffer.text,'unsaved text');assert(fresh.buffer.dirty);assert.equal(fresh.editor.identity,'same-editor');
console.log('PASS Source default and preview switching preserves unsaved text and editor instance');

const keyDoc = new Document(); const requests = []; let stopped = 0;
keyDoc.openSearch = replace => requests.push(replace);
const keyCx = { stop_propagation(){ stopped++; } };
for (const keystroke of ['ctrl-f','ctrl-h','cmd-f','cmd-alt-f','f','ctrl-s','ctrl-shift-f']) keyDoc.searchKeyUp({keystroke}, keyCx);
assert.deepEqual(requests, [false,true,false,true]); assert.equal(stopped,4);
console.log('PASS search key-up routing and unrelated key preservation');

let content='before', editorWrites=0, notifications=0;
const editDoc=new Document(); Object.assign(editDoc,{buffer:{text:content},discardArmed:true,note:'restored',editor:{value:()=>content,set_value(value){content=value;editorWrites++;}},updateTitle(){}});
const editCx={notify(){notifications++;}};
editDoc.applyTextChange('replacement',editCx); assert.equal(editDoc.buffer.text,'replacement'); assert.equal(editorWrites,1); assert(editDoc.draftPending); assert.equal(editDoc.note,null); assert.equal(editDoc.discardArmed,false);
content='typed'; editDoc.applyTextChange(content,editCx,false); assert.equal(editorWrites,1); assert.equal(editDoc.buffer.text,'typed');
editDoc.closed=true; editDoc.applyTextChange('late',editCx); assert.equal(content,'typed'); assert.equal(notifications,2);
console.log('PASS unified typed/replaced text updates and closed-document guard');
