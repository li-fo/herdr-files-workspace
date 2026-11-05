import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const testRoot = fs.mkdtempSync(path.join(repo, '.test-windows-'));
const app = path.join(testRoot, 'app-\u2018\u2019\u201a\u201b');
fs.mkdirSync(path.join(app, 'mods/files-workspace'), {recursive:true});
fs.copyFileSync(path.join(repo, 'mods/files-workspace/windows.ps1'), path.join(app, 'mods/files-workspace/windows.ps1'));
function nativeExec(cmd, args) {
  return new Promise((resolve, reject) => {
    if (cmd === 'powershell.exe') {
      const index = args.indexOf('-ExecutionPolicy');
      assert(index >= 0); assert.equal(args[index + 1], 'Bypass');
    }
    const child = spawn(cmd, args, {windowsHide:true, env:{...process.env, PSExecutionPolicyPreference:'Restricted'}});
    let stdout = '', stderr = '';
    child.stdout.on('data', b => stdout += b.toString('utf8'));
    child.stderr.on('data', b => stderr += b.toString('utf8'));
    child.on('error', reject);
    child.on('close', code => resolve({code,stdout,stderr}));
  });
}
globalThis.__herdr = {nativeExec, window: () => ({platform:'windows'}), appHome: () => app};
const adapterSource = fs.readFileSync(path.join(repo, 'mods/files-workspace/windows.js'), 'utf8')
  .replace('import { exec as nativeExec, window, appHome } from "herdr";', 'const {nativeExec,window,appHome} = globalThis.__herdr;');
const {windows,exec} = await import('data:text/javascript;base64,' + Buffer.from(adapterSource).toString('base64'));
const ok = async (action, args) => {
  const r = await windows(action,args); assert.equal(r.code,0,`${action}: ${r.stderr}`); return r.stdout.trim();
};
const waitJob = async (st, expected = '0') => {
  for (let i=0; i<150; i++) {
    if (fs.existsSync(st)) { assert.equal(fs.readFileSync(st,'utf8').trim(),expected,fs.existsSync(st+'.log') ? fs.readFileSync(st+'.log','utf8') : st); return; }
    await new Promise(r=>setTimeout(r,200));
  }
  throw new Error('Timed out: ' + st);
};
const fixture = path.join(testRoot, "한글 공백 ' \u2018\u2019\u201a\u201b [test] $(literal) `tick (1)");
fs.mkdirSync(fixture);
const file = path.join(fixture, "메모 ' [a] $test.txt");
await ok('create-file',[file]); fs.writeFileSync(file,'테스트\nhello');
assert.equal((await windows('create-file',[file])).code,17);
const folder = path.join(fixture,'폴더 [1]');
await ok('create-folder',[folder]);
assert.equal((await windows('create-folder',[folder])).code,17);
fs.writeFileSync(path.join(folder,'.hidden'),'hidden');
const listing = JSON.parse(await ok('list',[fixture]));
assert(listing.some(e=>e.name===path.basename(file)));
assert(listing.some(e=>e.name===path.basename(folder) && e.dir));
assert.equal((await windows('create-file',[path.join(fixture,'CON.txt')])).code,1);
assert.equal((await windows('move',[file,path.join(fixture,'폴더 [1]')])).code,17);
const renamed = path.join(fixture,"renamed ' [b].txt");
await ok('move',[file,renamed]); assert(fs.existsSync(renamed));
console.log('PASS Unicode, spaces, quotes, brackets, literal shell syntax, create/rename collision checks');

const dest = path.join(testRoot,'target'); fs.mkdirSync(dest);
for (let i=0;i<2;i++) {
  const tmp = await ok('temp',[path.join(dest,'.herdr-upload.XXXXXX')]);
  const st = path.join(app,'data/files-workspace',`send-${i}`);
  await ok('send',[st,'cp',tmp,renamed,folder]); await waitJob(st);
  await ok('place',[tmp,dest]);
}
assert.equal(fs.readFileSync(path.join(dest,"renamed ' [b] (1).txt"),'utf8'),'테스트\nhello');
assert.equal(fs.readFileSync(path.join(dest,'폴더 [1] (1)','.hidden'),'utf8'),'hidden');
assert(!fs.readdirSync(dest).some(n=>n.startsWith('.herdr-upload.')));
console.log('PASS detached uploads, hidden files, atomic collision naming, staging cleanup');

const stBad = path.join(app,'data/files-workspace/bad-send');
const sameName = path.join(testRoot,path.basename(renamed)); fs.writeFileSync(sameName,'other');
assert.equal((await windows('send',[stBad,'cp',dest,renamed,sameName])).code,1);
assert.equal((await windows('cleanup',[fixture])).code,1);
assert.equal((await windows('place',[fixture,dest])).code,1);
assert(fs.existsSync(renamed));
console.log('PASS duplicate-selection rejection and cleanup boundary protections');

const preview = path.join(app,'data/files-workspace/preview');
await ok('clean-preview',[preview]);
const png = path.join(preview,'image.png');
fs.writeFileSync(png,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ9sAAAAASUVORK5CYII=','base64'));
assert.match(await ok('image-size',[png]),/pixelWidth: 1/);
const converted = path.join(preview,'converted.png');
await ok('convert-image',[png,converted]); assert(fs.statSync(converted).size>0);
await ok('cleanup',[png,converted]);
console.log('PASS image sizing/conversion and scoped preview cleanup');

// Exercise the real Windows Downloads known-folder lookup, using unique synthetic files.
const testName = 'herdr-port-test-' + Date.now() + '.txt';
const testFile = path.join(testRoot,testName); fs.writeFileSync(testFile,'synthetic transfer test');
const downloaded = [];
try {
  for (let i=0;i<2;i++) {
    const st = path.join(app,'data/files-workspace',`download-${i}`);
    await ok('download',[testFile,'',testName,st,'cp','0']); await waitJob(st);
    const result = fs.readFileSync(st+'.dest','utf8'); downloaded.push(result);
    assert.equal(fs.readFileSync(result,'utf8'),'synthetic transfer test');
  }
  assert.notEqual(downloaded[0],downloaded[1]);
  assert.match(downloaded[1],/ \(1\)\.txt$/);
} finally {
  for (const p of downloaded) {
    assert(path.basename(p).startsWith(testName.slice(0,-4)));
    fs.unlinkSync(p); // Only our individually verified synthetic files.
  }
}
console.log('PASS detached downloads, Windows Downloads folder, duplicate names');
const custom = path.join(testRoot, "받은 파일 ' [custom] $(literal)");
fs.mkdirSync(custom);
for (let i=0;i<2;i++) {
  const st = path.join(app,'data/files-workspace',`custom-${i}`);
  await ok('download',[testFile,custom,testName,st,'cp','0']); await waitJob(st);
  const result = fs.readFileSync(st+'.dest','utf8');
  assert.equal(path.dirname(result),custom);
  assert.equal(fs.readFileSync(result,'utf8'),'synthetic transfer test');
}
assert(fs.existsSync(path.join(custom,testName.replace(/\.txt$/,' (1).txt'))));
assert.equal((await windows('download',[testFile,'relative-folder',testName,path.join(app,'data/files-workspace','relative'),'cp','0'])).code,1);
console.log('PASS custom download directory, special characters, collision names, invalid-path rejection');
const selfDownload = path.join(app,'data/files-workspace','self-download');
await ok('download',[folder,path.join(folder,'inside'),'folder',selfDownload,'cp','1']);
await waitJob(selfDownload,'1');
assert(!fs.existsSync(path.join(folder,'inside')));
console.log('PASS downloading a folder inside itself is refused before creating staging files');
const listingViaAdapter = await exec('sh',['-c','wc -c < "$1"','size',renamed]);
assert.equal(Number(listingViaAdapter.stdout.trim()),Buffer.byteLength('테스트\nhello'));
console.log('PASS JavaScript adapter -> PowerShell JSON/quoting round trip');
const failTmp = await ok('temp',[path.join(dest,'.herdr-upload.XXXXXX')]);
const failStatus = path.join(app,'data/files-workspace','missing-source');
await ok('send',[failStatus,'cp',failTmp,path.join(testRoot,'not-there')]);
await waitJob(failStatus,'1');
assert(fs.readFileSync(failStatus+'.log','utf8').trim());
await ok('cleanup',[failTmp]);
const recursiveTmp = await ok('temp',[path.join(folder,'.herdr-upload.XXXXXX')]);
const recursiveStatus = path.join(app,'data/files-workspace','self-copy');
await ok('send',[recursiveStatus,'cp',recursiveTmp,folder]);
await waitJob(recursiveStatus,'1');
await ok('cleanup',[recursiveTmp]);
console.log('PASS failed-worker status/logs and recursive self-copy prevention');
assert(Array.isArray(JSON.parse(await ok('clipboard-files',[]))));
const recycleTest = path.join(testRoot,'herdr-test-recycle.txt');
fs.writeFileSync(recycleTest,'Synthetic Herdr recycle-bin test file; safe to remove.');
await ok('trash',[recycleTest]); assert(!fs.existsSync(recycleTest));
console.log('PASS Explorer file clipboard reading (unchanged) and recycling a synthetic file');
console.log('Test artifacts: ' + testRoot);
