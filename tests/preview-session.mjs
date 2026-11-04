import assert from 'node:assert/strict';
import { PreviewSession } from '../mods/files-workspace/preview-session.js';

const pending = [], disposed = [];
const session = new PreviewSession(() => new Promise((resolve, reject) => pending.push({resolve, reject})));
const markdown = name => '```mermaid\ngraph TD; ' + name + '-->B\n```';
const asset = name => ({items: [{file: name}], async dispose(){disposed.push(name);}});
const tick = () => new Promise(resolve => setImmediate(resolve));
const old = session.update(markdown('old'), {}); await tick();
const current = session.update(markdown('new'), {}); await tick();
pending[1].resolve(asset('new')); await current;
pending[0].resolve(asset('old')); await old;
assert.equal(session.blocks[0].diagram.file, 'new');
assert.deepEqual(disposed, ['old']);
await session.update('Plain markdown', {});
assert.deepEqual(disposed, ['old', 'new']); assert.equal(pending.length, 2);
const closing = session.update(markdown('closing'), {}); await tick();
await session.close(); pending[2].resolve(asset('closing')); await closing;
assert.deepEqual(disposed, ['old', 'new', 'closing']);
assert.equal(session.asset, null); assert.equal(session.blocks[0].diagram, undefined);
await session.update(markdown('ignored'), {}); assert.equal(pending.length, 3);

const failure = new PreviewSession(async () => {throw new Error('render failed');});
await failure.update(markdown('failed'), {});
assert.equal(failure.error, 'render failed'); assert.equal(failure.busy, false);
await failure.update('Recovered', {}); assert.equal(failure.error, null);
console.log('PASS preview replacement, stale completion cleanup, close during rendering, plain markdown and error recovery');
