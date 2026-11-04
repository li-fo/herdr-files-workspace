import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=fs.readFileSync('mods/files-workspace/main.js','utf8');
const valid=vm.runInNewContext(source.slice(source.indexOf('const validName ='),source.indexOf('// Run on the entry'))+'\nvalidName',{isWindows:()=>true});
for(const name of ['a:b.md','CON','trailing.']) {assert(!valid(name,null)); assert(valid(name,'dgx01'));}
for(const name of ['../x','a/b','', '..']) {assert(!valid(name,null));assert(!valid(name,'dgx01'));}
console.log('PASS filename rules follow local Windows versus remote POSIX target');
