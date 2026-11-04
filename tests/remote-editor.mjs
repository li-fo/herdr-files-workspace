import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
const machine=process.argv[2];assert(machine);
const root=await fs.mkdtemp(path.join(process.cwd(),'.test-remote-'));
const run=(cmd,args)=>new Promise((resolve,reject)=>{const c=spawn(cmd,args,{windowsHide:true});let stdout='',stderr='';c.stdout.setEncoding('utf8');c.stderr.setEncoding('utf8');c.stdout.on('data',b=>stdout+=b.toString('utf8'));c.stderr.on('data',b=>stderr+=b.toString('utf8'));c.on('error',reject);c.on('close',code=>resolve({code,stdout,stderr}));});
const exec=(cmd,args=[],options={})=>options.on ? run('hc',['exec','--on',options.on,cmd,...args]) : run(cmd,args);
const check=async(cmd,args)=>{const r=await exec(cmd,args,{on:machine});assert.equal(r.code,0,r.stderr);return r.stdout.trim();};
const source=(await fs.readFile('mods/files-workspace/remote-text.js','utf8')).replace(/^import .*;$/gm,'').replaceAll('export ','');
const api=vm.runInNewContext(source+'\n({loadText,saveText})',{
  exec,hc:args=>run('hc',args),appHome:()=>root,unlink:fs.unlink,
  writeTextFile:async(p,text,expected)=>{assert.equal(expected,null);await fs.mkdir(path.dirname(p),{recursive:true});await fs.writeFile(p,text,{flag:'wx'});}
});
const dir=await check('mktemp',['-d','/tmp/herdr-editor-test.XXXXXXXX']);
assert.match(dir,/^\/tmp\/herdr-editor-test\.[A-Za-z0-9]+$/);
const file=dir+"/한글 ' [file].md",info={on:machine,file};
const initial='\ufeff# 한글\r\ninitial\r\n';
try{
  await check('python3',['-c',"import pathlib,sys;pathlib.Path(sys.argv[1]).write_bytes(sys.argv[2].encode('utf-8'))",file,initial]);
  const before=await api.loadText(info);assert.equal(before.text,initial);
  const raw='\ufeff# 한글\r\nchanged\r\n'+('한글 😀 <tag>\r\n'.repeat(6000));
  const version=await api.saveText(info,{raw,expected:initial},before.version);
  const after=await api.loadText(info);assert.equal(after.text,raw);assert.equal(after.version,version);
  await assert.rejects(api.saveText(info,{raw:'stale',expected:initial},before.version),/changed outside/);
  assert.equal((await api.loadText(info)).text,raw);
  await check('python3',['-c',"import pathlib,sys;pathlib.Path(sys.argv[1]).write_bytes(bytes([255,254,0,1]))",file]);
  await assert.rejects(api.loadText(info),/utf-8/);
  assert.deepEqual(await fs.readdir(path.join(root,'data/files-workspace/editor')),[]);
  console.log('PASS remote editing, large Unicode/CRLF/BOM payload, optimistic conflict rejection, strict UTF-8 and spool cleanup');
}finally{await check('rm',['-rf','--',dir]);}
