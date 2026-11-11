import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {performance} from 'node:perf_hooks';
const source=fs.readFileSync('mods/files-workspace/file-operations.js','utf8').replace(/^import .*;$/gm,'').replaceAll('export ','');
let calls=0;
const api=vm.runInNewContext(source+'\n({directory})',{
  isWindows:()=>true,
  windows:async(action,args)=>{calls++;assert.equal(action,'list-many');return {code:0,stdout:JSON.stringify(JSON.parse(args[0]).map(p=>p==='missing'?{error:'missing'}:{entries:[{name:p,dir:false}]}))};}
});
const first=api.directory('F:/repo',null),duplicate=api.directory('f:/REPO',null);
assert.equal(first,duplicate);
const results=await Promise.allSettled([first,api.directory('missing'),api.directory('F:/other')]);
assert.equal(calls,1);assert.equal(results[1].status,'rejected');assert.equal(results[2].value[0].name,'F:/other');
await api.directory('F:/repo');assert.equal(calls,2,'completed reads must not become stale permanent caches');
await Promise.all(Array.from({length:40},(_,i)=>api.directory('F:/'+i)));assert.equal(calls,4,'batch size is bounded');

if(process.platform==='win32') {
  const root=fs.mkdtempSync(path.join(process.cwd(),'.test-directory-'));
  const folders=Array.from({length:6},(_,i)=>path.join(root,'folder-'+i));
  folders.forEach(folder=>{fs.mkdirSync(folder);fs.writeFileSync(path.join(folder,'한글 [a].txt'),'test');});
  const quote=s=>"'"+s.replace(/['\u2018\u2019\u201a\u201b]/g,"$&$&")+"'";
  const run=(action,args)=>new Promise((resolve,reject)=>{
    const request=JSON.stringify({action,args,appHome:root});
    const child=spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-Command',"& './mods/files-workspace/windows.ps1' -Request "+quote(request)],{windowsHide:true});
    let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b.toString('utf8'));child.stderr.on('data',b=>stderr+=b.toString('utf8'));
    child.on('error',reject);child.on('close',code=>code?reject(Error(stderr)):resolve(JSON.parse(stdout)));
  });
  try {
    const start=performance.now();for(const folder of folders) await run('list',[folder]);const sequential=Math.round(performance.now()-start);
    const batchedStart=performance.now();const rows=await run('list-many',[JSON.stringify(folders)]);const batched=Math.round(performance.now()-batchedStart);
    assert.equal(rows.length,6);for(const row of rows) {assert.equal(row.error,null);assert.equal(row.entries[0].name,'한글 [a].txt');}
    const mixed=await run('list-many',[JSON.stringify([folders[0],path.join(root,'missing'),folders[1]])]);
    assert(mixed[1].error);assert.equal(mixed[2].entries.length,1);
    const empty=path.join(root,'empty');fs.mkdirSync(empty);const single=await run('list-many',[JSON.stringify([empty])]);assert.deepEqual(single[0].entries,[]);
    console.log(`6-folder read: sequential=${sequential}ms, batched=${batched}ms (process + listing, not UI rendering)`);
  } finally {
    assert(path.resolve(root).startsWith(path.resolve(process.cwd())+path.sep));fs.rmSync(root,{recursive:true,force:true});
  }
}
console.log('PASS directory deduplication, bounded batches, per-folder errors, retry, Windows names and empty folders');
