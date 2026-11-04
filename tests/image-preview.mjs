import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const root=fs.mkdtempSync(path.join(process.cwd(),'.test-windows-image-'));
const app=path.join(root,'app'), script=path.resolve('mods/files-workspace/windows.ps1');
const preview=path.join(app,'data/files-workspace/preview');
const quote=s=>"'"+s.replaceAll("'","''")+"'";
function run(action,args) {
  const request=JSON.stringify({action,args,appHome:app});
  const start=performance.now();
  const result=spawnSync('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-STA','-Command',`& ${quote(script)} -Request ${quote(request)}; exit $LASTEXITCODE`],{encoding:'utf8',windowsHide:true});
  return {...result,ms:performance.now()-start};
}
function ok(action,args) {const r=run(action,args); assert.equal(r.status,0,r.stderr); return r;}
const src=path.join(root,"한글 ' [image].png");
fs.writeFileSync(src,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ9sAAAAASUVORK5CYII=','base64'));
const source=fs.readFileSync(src);
const result=JSON.parse(ok('prepare-image',[src,50*1024*1024,false]).stdout);
assert.equal(result.w,1);assert.equal(result.h,1);assert.equal(result.bytes,source.length);
assert.deepEqual(fs.readFileSync(result.file),source);
assert.deepEqual(fs.readFileSync(src),source);
const converted=JSON.parse(ok('prepare-image',[src,50*1024*1024,true]).stdout);
assert(converted.file.endsWith('converted.png')); assert(fs.statSync(converted.file).size>0);
const svg=path.join(root,'image.svg');fs.writeFileSync(svg,'<svg xmlns="http://www.w3.org/2000/svg" width="10" height="20"/>');
assert.equal(JSON.parse(ok('prepare-image',[svg,5000,false]).stdout).w,null);
const count=fs.readdirSync(preview).length;
assert.equal(run('prepare-image',[src,1,false]).status,1);
const bad=path.join(root,'bad.png');fs.writeFileSync(bad,'invalid');
assert.equal(run('prepare-image',[bad,5000,false]).status,1);
assert.equal(fs.readdirSync(preview).length,count,'failed preparation must not leak folders');
ok('cleanup',[path.dirname(result.file)]);assert(!fs.existsSync(result.file));assert(fs.existsSync(src));
console.log('PASS image bytes/dimensions, Unicode paths, conversion, SVG, size limit, corrupt image cleanup and source preservation');

const bench=process.argv[2] || src;
const dir=path.join(preview,'benchmark'), copy=path.join(dir,'copy.png'), renamed=path.join(dir,'image.png');
let old=ok('size',[bench]).ms;
old+=ok('mkdir',[dir]).ms; old+=ok('copy',[bench,copy]).ms;
old+=ok('move',[copy,renamed]).ms; old+=ok('image-size',[renamed]).ms;
const fast=ok('prepare-image',[bench,50*1024*1024,false]);
console.log(`Preparation benchmark (not GPU rendering): old=${Math.round(old)}ms, combined=${Math.round(fast.ms)}ms`);
