import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import {
  drainOwnedProcessGroup,
  ownedProcessGroupAlive,
} from './owned-process-group.mjs';

function jsLiteral(value) {
  const serialized = JSON.stringify(value);
  if (serialized === undefined)
    throw new TypeError('JavaScript literals must be JSON-serializable.');
  return serialized.replace(
    /[<>&/\u2028\u2029]/gu,
    (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`
  );
}

test('launcher exit does not hide a surviving SIGTERM-resistant descendant', {
  timeout: 15_000,
}, async (t) => {
  const temporary = await mkdtemp(join(tmpdir(), 'apps-owned-group-'));
  const ready = join(temporary, 'ready');
  const descendant = `const fs=require('node:fs');process.on('SIGTERM',()=>{});fs.writeFileSync(${jsLiteral(ready)},String(process.pid));setInterval(()=>{},1000);`;
  const launcher = spawn(
    process.execPath,
    [
      '-e',
      `const {spawn}=require('node:child_process');const fs=require('node:fs');const c=spawn(process.execPath,['-e',${jsLiteral(descendant)}],{stdio:'ignore'});c.unref();const timer=setInterval(()=>{if(fs.existsSync(${jsLiteral(ready)})){clearInterval(timer);process.exit(0)}},10);`,
    ],
    {
      detached: true,
      stdio: 'ignore',
    }
  );
  const group = launcher.pid;
  assert.ok(group);
  // Always recover the exact fixture group, even when the RED assertion fails.
  t.after(async () => {
    try {
      process.kill(-group, 'SIGKILL');
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
    const deadline = performance.now() + 2_000;
    while (ownedProcessGroupAlive(group) && performance.now() < deadline)
      await delay(25);
    assert.equal(ownedProcessGroupAlive(group), false, 'Fixture group drained');
    await rm(temporary, { recursive: true, force: true });
  });
  await new Promise((resolve, reject) => {
    launcher.once('error', reject);
    launcher.once('exit', (code) =>
      code === 0 ? resolve() : reject(new Error('Fixture launcher failed'))
    );
  });
  assert.ok(Number(await readFile(ready, 'utf8')) > 1);
  assert.equal(ownedProcessGroupAlive(group), true);
  const result = await drainOwnedProcessGroup(group);
  assert.equal(result.escalated, true);
  assert.equal(result.drained, true);
  assert.equal(ownedProcessGroupAlive(group), false);
});

test('invalid group identifiers are denied without signalling', async () => {
  for (const group of [0, -1, 1, process.pid, Number.NaN]) {
    await assert.rejects(
      drainOwnedProcessGroup(group),
      /Invalid owned process group/
    );
  }
});
