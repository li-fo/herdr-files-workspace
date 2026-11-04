// Uses only synthetic fixtures in one mktemp directory on the named test machine.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {spawn} from 'node:child_process';
const repo = process.cwd(), machine = process.argv[2];
assert(machine, 'Pass a connected Herdr machine name');
const root = fs.mkdtempSync(path.join(repo,'.test-remote-'));
const app = path.join(root,'app');
fs.mkdirSync(path.join(app,'mods/files-workspace'),{recursive:true});
fs.copyFileSync('mods/files-workspace/windows.ps1',path.join(app,'mods/files-workspace/windows.ps1'));
const run = (cmd,args) => new Promise((resolve,reject)=>{
  const child=spawn(cmd,args,{windowsHide:true}); let stdout='',stderr='';
  child.stdout.on('data',b=>stdout+=b.toString('utf8')); child.stderr.on('data',b=>stderr+=b.toString('utf8'));
  child.on('error',reject);child.on('close',code=>resolve({code,stdout,stderr}));
});
const checked = async (cmd,args)=>{const r=await run(cmd,args);assert.equal(r.code,0,r.stderr);return r.stdout.trim();};
globalThis.__herdr={nativeExec:run,window:()=>({platform:'windows'}),appHome:()=>app};
const source=fs.readFileSync('mods/files-workspace/windows.js','utf8').replace('import { exec as nativeExec, window, appHome } from "herdr";','const {nativeExec,window,appHome}=globalThis.__herdr;');
const {windows}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const op=async(action,args)=>{const r=await windows(action,args);assert.equal(r.code,0,r.stderr);return r.stdout.trim();};
const remote=(...args)=>checked('hc',['exec','--on',machine,...args]);
const machines=JSON.parse(await checked('hc',['machine','ls','--json']));
const target=machines.machines.find(m=>m.name===machine)?.target; assert(target);
const dir=await remote('mktemp','-d','/tmp/herdr-files-workspace-test.XXXXXXXX');
assert.match(dir,/^\/tmp\/herdr-files-workspace-test\.[A-Za-z0-9]+$/);
const waitJob=async st=>{
  for(let i=0;i<200;i++){
    if(fs.existsSync(st)){assert.equal(fs.readFileSync(st,'utf8'),'0',fs.existsSync(st+'.log')?fs.readFileSync(st+'.log','utf8'):'failed');return;}
    await new Promise(r=>setTimeout(r,200));
  }throw new Error('Transfer timed out');
};
const text='synthetic remote round trip 한글\n';
const name=`herdr-port-${Date.now()} 한글 ' [a].txt`;
const file=path.join(root,name);fs.writeFileSync(file,text);
const folder=path.join(root,"folder ' [1]");fs.mkdirSync(folder);fs.writeFileSync(path.join(folder,'.hidden'),'hidden');
const placeCode=fs.readFileSync('mods/files-workspace/file-operations.js','utf8').match(/const PLACE = `[\s\S]*?`;/)[0];
const place=vm.runInNewContext(placeCode+'\nPLACE');
const downloads=[];
try{
  for(let i=0;i<2;i++){
    const tmp=await remote('mktemp','-d',dir+'/.herdr-upload.XXXXXX');
    assert(tmp.startsWith(dir+'/.herdr-upload.'));
    const st=path.join(app,'data/files-workspace','send-'+i);
    await op('send',[st,'scp',`${target}:${tmp}/`,file,folder]);await waitJob(st);
    await remote('sh','-c',place,'place',tmp,dir);
  }
  assert.equal(await remote('cat',dir+'/'+name),text.trim());
  assert.equal(await remote('cat',dir+'/'+name.replace(/\.txt$/,' (1).txt')),text.trim());
  assert.equal(await remote('cat',dir+"/folder ' [1] (1)/.hidden"),'hidden');
  console.log('PASS Windows -> SSH/SFTP upload, Unicode/quotes/spaces, hidden files, duplicate names');
  const st=path.join(app,'data/files-workspace','download');
  const custom=path.join(root,"다운로드 ' [custom]");fs.mkdirSync(custom);
  await op('download',[`${target}:${dir}/${name}`,custom,name,st,'scp','0']);await waitJob(st);
  const saved=fs.readFileSync(st+'.dest','utf8');downloads.push(saved);
  assert.equal(path.dirname(saved),custom);
  assert.equal(fs.readFileSync(saved,'utf8'),text);
  console.log('PASS SSH/SFTP -> Windows download: byte-identical round trip');
}finally{
  for(const p of downloads){assert.equal(path.basename(p),name);fs.unlinkSync(p);}
  assert.match(dir,/^\/tmp\/herdr-files-workspace-test\.[A-Za-z0-9]+$/);
  await remote('rm','-rf','--',dir);
}
console.log('Remote test directory removed. Local artifacts: '+root);
