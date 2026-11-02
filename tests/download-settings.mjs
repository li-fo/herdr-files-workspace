import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Exercise the actual panel download method with Herdr's UI/process boundary mocked.
const values = new Map(), transfers = [];
let picked = null, pickerCalls = 0, remoteCalls = 0;
const shared = key => values.get(key);
const setShared = (key,value) => values.set(key,value);
const pickFolder = async () => { pickerCalls++; return picked; };
function loadSettings() {
  const source = fs.readFileSync('mods/files-transfer/download-settings.js','utf8')
    .replace(/^import .*;$/gm,'').replaceAll('export ', '');
  const context = vm.createContext({shared,setShared,pickFolder});
  return vm.runInContext(source + '\n({downloadDirectory,chooseDownloadDirectory})',context);
}
const settings = loadSettings();
const source = fs.readFileSync('mods/files-transfer/main.js','utf8')
  .replace(/^import .*;$/gm,'').replace('export default class Files','class Files');
const context = vm.createContext({
  ...settings, shared, setShared, View:class {}, isWindows:()=>true,
  home:()=> 'C:/Users/test', appHome:()=> 'C:/Herdr',
  exec:async (...args)=>{transfers.push(args);return {code:0,stdout:'',stderr:''};},
  hc:async ()=>{remoteCalls++;return {stdout:JSON.stringify({machines:[{name:'server',target:'host'}]})};}
});
const {Files,MENU,STRINGS} = vm.runInContext(source+'\n({Files,MENU,STRINGS})',context);
const target={dir:false,on:null};
assert.equal(MENU(target,STRINGS.en)[0][1],'Download to Downloads');
assert.equal(MENU(target,STRINGS.en)[1][1],'Download to…');
const panel = new Files();panel.jobs=[];
await panel.download('C:/source/a.txt','a.txt',false,'server',true);
assert.equal(transfers.length,0);assert.equal(remoteCalls,0);assert.equal(settings.downloadDirectory(),null);
picked="F:\\받은 파일 ' [test]";
await panel.download('C:/source/a.txt','a.txt',false,null,true);
assert.equal(transfers.at(-1)[1][4],picked);
assert.equal(panel.jobs[0].destination,picked);
assert.equal(loadSettings().downloadDirectory(),picked); // New module/panel reads persisted shared value.
assert.equal(MENU(target,STRINGS.en)[0][1],`Download to ${picked}`);
assert.equal(MENU({...target,dir:true},STRINGS.en)[0][1],`Download to ${picked}`);
const calls=pickerCalls;
await panel.download('/tmp/a.txt','a.txt',false,'server');
assert.equal(pickerCalls,calls);assert.equal(transfers.at(-1)[1][4],picked);
assert.equal(transfers.at(-1)[1][3],'host:/tmp/a.txt');
const before=transfers.length, last=picked;
picked=null;
await panel.download('C:/source/a.txt','a.txt',false,null,true);
assert.equal(transfers.length,before);assert.equal(settings.downloadDirectory(),last);
picked='F:\\Other';await panel.download('C:/source/a.txt','a.txt',false,null,true);
assert.equal(panel.jobs[0].destination,last); // In-flight jobs never follow later preference changes.
values.clear();
await panel.download('C:/source/a.txt','a.txt',false,null);
assert.equal(transfers.at(-1)[1][4],''); // Windows resolves its real Downloads known folder.
console.log('PASS menu labels, picker cancellation, remembered path across panel loads, quick download, remote routing and in-flight destination snapshot');
