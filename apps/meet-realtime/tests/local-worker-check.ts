import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { startLocalWorker } from './local-worker';

let persistence = '';
let executable: string[] = [];
const failure = new Error('synthetic spawn failure');
const spawn: typeof Bun.spawn = ((command: string[]) => {
  executable = command.slice(0, 3);
  persistence = command[command.indexOf('--persist-to') + 1]!;
  throw failure;
}) as typeof Bun.spawn;
await assert.rejects(startLocalWorker(spawn), (error) => error === failure);
assert.deepEqual(executable, [process.execPath, 'x', 'wrangler']);
assert(persistence.includes('ttr-realtime-'));
await assert.rejects(access(persistence), { code: 'ENOENT' });
console.log('Local Worker spawn-failure cleanup contract PASS');
