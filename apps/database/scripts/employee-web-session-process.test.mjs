import assert from 'node:assert/strict';
import test from 'node:test';
import { runOwnedSessionProcess } from './employee-web-session-process.mjs';

test('owned session captures bounded output and proves complete group exit', async () => {
  const result = await runOwnedSessionProcess(
    process.execPath,
    ['-e', 'process.stdout.write("receipt")'],
    {
      cwd: process.cwd(),
      input: '',
      timeoutMs: 1000,
    }
  );
  assert.deepEqual(result, {
    stdout: 'receipt',
    status: 0,
    processGroupStopped: true,
  });
});
test('timeout terminates a live fixture group and cannot accept a success-shaped receipt', async () => {
  const result = await runOwnedSessionProcess(
    process.execPath,
    ['-e', 'process.stdout.write("receipt");setInterval(()=>{},1000)'],
    {
      cwd: process.cwd(),
      input: '',
      timeoutMs: 100,
    }
  );
  assert.equal(result.status, null);
  assert.equal(result.processGroupStopped, true);
});
test('descendant surviving a successful leader is terminated before group cleanup qualifies', async () => {
  const result = await runOwnedSessionProcess(
    process.execPath,
    [
      '-e',
      'require("node:child_process").spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{stdio:"ignore"}).unref();process.stdout.write("receipt")',
    ],
    {
      cwd: process.cwd(),
      input: '',
      timeoutMs: 1000,
    }
  );
  assert.equal(result.status, 0);
  assert.equal(result.processGroupStopped, true);
});
test('oversized receipt output fails closed and drains its owned process group', async () => {
  const result = await runOwnedSessionProcess(
    process.execPath,
    ['-e', 'process.stdout.write("x".repeat(8193))'],
    {
      cwd: process.cwd(),
      input: '',
      timeoutMs: 1000,
    }
  );
  assert.equal(result.stdout, '');
  assert.equal(result.status, null);
  assert.equal(result.processGroupStopped, true);
});
