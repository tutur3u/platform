import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { runCommand } from './command.mjs';

test('stub root runs the local script and never falls through', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'desktop-command-'));
  const previous = process.env.DESKTOP_COMMAND_STUB_ROOT;
  process.env.DESKTOP_COMMAND_STUB_ROOT = directory;
  try {
    await writeFile(join(directory, 'echo-ok.mjs'), 'console.log("ok")\n');
    assert.equal(
      runCommand('echo-ok', [], { encoding: 'utf8' }).trim(),
      'ok'
    );
    assert.throws(
      () => runCommand('../echo-ok', [], { encoding: 'utf8' }),
      /Invalid desktop command stub/
    );
    assert.throws(
      () => runCommand('missing', [], { encoding: 'utf8' }),
      /Missing desktop command stub for missing/
    );
  } finally {
    if (previous === undefined) delete process.env.DESKTOP_COMMAND_STUB_ROOT;
    else process.env.DESKTOP_COMMAND_STUB_ROOT = previous;
    await rm(directory, { recursive: true, force: true });
  }
});
