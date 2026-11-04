import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const info={root:'F:/dev',projectRoot:'F:/dev',file:'F:/dev/test.png',on:null};
let prepares=0, cleanup=0, resolve, notifications=0;
const source=fs.readFileSync('mods/files-workspace/main.js','utf8').replace(/^import .*;$/gm,'').replace('export default class Files','class Files');
const Files=vm.runInNewContext(source+'\nFiles',{
  View:class {},TransferQueue:class {jobs=[];},props:()=>({viewer:info}),
  isWindows:()=>true,appHome:()=> 'C:/app',
  windows(action){assert.equal(action,'prepare-image');prepares++;return new Promise(r=>resolve=r);},
  exec(command,args){assert.equal(command,'rm');assert.equal(args[0],'-rf');cleanup++;return Promise.resolve({code:0});}
});
let task;
const cx={focus_handle:()=>({}),spawn(fn){task=fn(cx);},notify(){notifications++;},timer:{every(){throw Error('Viewer must not poll');}}};
const viewer=new Files();viewer.init({},cx);
assert.equal(prepares,1);assert.equal(viewer.file,'test.png');assert.equal(viewer.projectRoot,'F:/dev');
resolve({code:0,stdout:JSON.stringify({file:'C:/app/data/files-workspace/preview/a/image.png',bytes:10,w:20,h:30})});await task;
assert.equal(viewer.img.w,20);assert.equal(viewer.img.rel,'data/files-workspace/preview/a/image.png');assert.equal(notifications,1);
viewer.close();assert.equal(cleanup,1);
const late=new Files();late.init({},cx);late.close();
resolve({code:0,stdout:JSON.stringify({file:'C:/app/data/files-workspace/preview/b/image.png',bytes:10,w:20,h:30})});await task;
assert.equal(cleanup,2);assert.equal(late.img,undefined);assert.equal(notifications,1);
console.log('PASS viewer skips browsing/polling, single preparation call, image mapping and close-during-load cleanup');
