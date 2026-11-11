import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {spawnSync} from 'node:child_process';
const source=fs.readFileSync('mods/files-workspace/main.js','utf8').replace(/^import .*;$/gm,'').replace('export default class Files','class Files');
let overlay, closed, finished, started=0;
const values=new Map(),tasks=[];
const Files=vm.runInNewContext(source+'\nFiles',{
  View:class {},openOverlay:value=>overlay=value,notify:value=>finished=value,
  closeDeletedFiles:items=>closed=items,endMove(){},props:()=>({}),
  shared:key=>values.get(key),setShared:(key,value)=>values.set(key,value),
  moveFiles:async(rows,on,operation)=>{assert.equal(operation,'copy');assert.equal(rows.length,1);started++;return {completed:rows.map(item=>({...item,replaced:true})),skipped:[]};}
});
const panel=new Files();Object.assign(panel,{root:'F:/repo',on:null,me:'panel',resumeTree(){},clearSelection(){},reveal(){},refresh(){}});
const cx={notify(){},stop_propagation(){},spawn(fn){tasks.push(fn(cx));}};
panel.drag={finish:()=>({root:panel.root,items:[{path:'a.txt'}],on:null,target:'dest'})};
panel.dragEnd('dest',cx);assert.equal(started,0,'drop asks before changing files');assert.equal(overlay.props.dropChoice.destination,'F:/repo/dest');
let chosen;
panel.moveItems=(req,dest)=>chosen={req,dest};
values.set('files-workspace.request',{...overlay.props.dropChoice,id:'copy-choice',action:'drop-choice',operation:'copy'});
panel.take(cx);assert.equal(chosen.req.operation,'copy');assert.equal(chosen.dest,'F:/repo/dest');
values.set('files-workspace.request',{...overlay.props.dropChoice,id:'context-copy',action:'copy-to'});
panel.take(cx);assert.equal(overlay.props.ask.operation,'copy');assert.equal(overlay.props.ask.kind,'move');
panel.moveJob={token:'test',operation:'copy',req:{rootPath:panel.root,on:null},pending:[{src:'F:/repo/a.txt',dest:'F:/repo/dest/a.txt'},{src:'F:/repo/b.txt',dest:'F:/repo/dest/b.txt'}],completed:[],skipped:0};
panel.runMoveJob(cx);
for(let i=0;i<tasks.length;i++) await tasks[i];
assert.equal(started,2);assert.equal(panel.moveJob,null);
assert.equal(closed.length,2);assert(closed.every(item=>item.file.startsWith('F:/repo/dest/')),'source tabs stay open');
assert.match(finished.body,/2 copied/);

if(process.platform==='win32') {
  const root=fs.mkdtempSync(path.join(process.cwd(),'.test-copy-'));
  const src=path.join(root,'원본 [source]'),dest=path.join(root,'target');fs.mkdirSync(src);fs.mkdirSync(dest);
  const file=path.join(src,'note.txt');fs.writeFileSync(file,'original');
  const folder=path.join(src,'folder');fs.mkdirSync(folder);fs.mkdirSync(path.join(folder,'nested'));fs.writeFileSync(path.join(folder,'nested','data.txt'),'nested content');
  const quote=s=>"'"+s.replace(/['\u2018\u2019\u201a\u201b]/g,"$&$&")+"'";
  const invoke=(items,script='./mods/files-workspace/windows.ps1')=>{
    const request=JSON.stringify({action:'copy-items',args:[JSON.stringify(items)],appHome:root});
    const result=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-Command',`& ${quote(script)} -Request ${quote(request)}`],{windowsHide:true,encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout);
  };
  try {
    const item={src:file,dest:path.join(dest,'note.txt'),dir:false};
    let result=invoke([item,{src:folder,dest:path.join(dest,'folder'),dir:true}]);assert.equal(result.error,null);assert.equal(result.completed.length,2);
    assert.equal(fs.readFileSync(file,'utf8'),'original');assert.equal(fs.readFileSync(item.dest,'utf8'),'original');
    assert.equal(fs.readFileSync(path.join(dest,'folder','nested','data.txt'),'utf8'),'nested content');assert(fs.existsSync(folder));
    result=invoke([item]);assert(result.conflict);assert.equal(result.completed.length,0);
    result=invoke([{...item,policy:'skip'}]);assert.equal(result.skipped.length,1);
    result=invoke([{...item,policy:'rename'}]);assert.equal(result.error,null);assert.equal(fs.readFileSync(path.join(dest,'note (1).txt'),'utf8'),'original');
    fs.writeFileSync(file,'updated');result=invoke([{...item,policy:'overwrite'}]);assert.equal(result.error,null);assert.equal(fs.readFileSync(item.dest,'utf8'),'updated');assert(fs.existsSync(file));
    result=invoke([{src:folder,dest:path.join(folder,'nested','folder'),dir:true}]);assert.match(result.error,/itself/);
    // Failed publication restores the old destination and does not touch the original source.
    fs.writeFileSync(item.dest,'previous target');
    const faulty=path.join(root,'fail-publish.ps1');fs.writeFileSync(faulty,fs.readFileSync('mods/files-workspace/windows.ps1','utf8').replace('try { MoveFresh $src $dest }',"try { throw 'Injected publish failure' }"));
    result=invoke([{...item,policy:'overwrite'}],faulty);assert.match(result.error,/Injected publish failure/);
    assert.equal(fs.readFileSync(item.dest,'utf8'),'previous target');assert.equal(fs.readFileSync(file,'utf8'),'updated');
    assert(!fs.readdirSync(dest).some(name=>name.startsWith('.herdr-upload.')),'copy staging is removed');
  } finally {assert(path.resolve(root).startsWith(path.resolve(process.cwd())+path.sep));fs.rmSync(root,{recursive:true,force:true});}
}
console.log('PASS drop choice, Copy to routing, per-item copy processing, source tab preservation, recursive copy, conflicts, rollback and staging cleanup');

const backend=fs.readFileSync('mods/files-workspace/file-move.js','utf8').replace(/^import .*;$/gm,'').replaceAll('export ','');
const python=vm.runInNewContext(backend+'\nPOSIX_MOVE',{});
const parsed=spawnSync('python',['-c','import sys; compile(sys.stdin.read(), "file-operation", "exec")'],{input:python,encoding:'utf8',windowsHide:true});
assert.equal(parsed.status,0,parsed.stderr);
console.log('PASS POSIX worker syntax (remote filesystem execution is not covered by this test)');
