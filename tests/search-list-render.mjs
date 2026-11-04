import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { matches, replaceMatches } from '../mods/files-workspace/search-text.js';
let renderingRows = false, clicked, rows;
const element = () => {
  const el = new Proxy({}, {get: (_target, name) => (...args) => {
    if (name === 'on_click' && renderingRows) throw Error('Handlers forbidden during virtual row rendering');
    if (name === 'on_item_click') clicked = args[0];
    if (name === 'when' && args[0]) args[1](el);
    return el;
  }});
  return el;
};
const source = fs.readFileSync('mods/files-workspace/document-search.js','utf8').replace(/^import .*;$/gm,'').replace('export default class','class');
const Search = vm.runInNewContext(source+'\nDocumentSearch', {
  matches, replaceMatches, div:element, h_flex:element, v_flex:element,
  Input:{new:element}, Scrollbar:{vertical:element}, theme:()=>({}),
  v_virtual_list:(_id,count,_height,key,render)=>{
    assert.equal(count,60); assert.equal(key(0),'0:5');
    renderingRows=true; try {rows=render({start:0,end:5});} finally {renderingRows=false;}
    return element();
  }
});
const search = new Search({editor:{value:()=> 'match\n'.repeat(60)}});
search.query={value:()=> 'match'};
search.render({}); assert.equal(rows.length,5);
clicked('12:17',{notify(){}}); assert.equal(search.index,2);
clicked('stale',{notify(){throw Error('stale result notified');}}); assert.equal(search.index,2);
console.log('PASS deferred search rows contain no handlers; list click selects the matching result');
