import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { setTimeout } from 'node:timers/promises';

async function helper(name, variable) {
  const source = await readFile(
    new URL(
      `../../apps/mobile/lib/features/desktop_update/${name}.dart`,
      import.meta.url
    ),
    'utf8'
  );
  const script = source.split(`const ${variable} = r'''`)[1]?.split("''';")[0];
  assert.ok(script, 'The native updater helper must be a literal script');
  return script;
}

test('macOS updater helper parses without executing installation', {
  skip: process.platform === 'win32',
}, async () => {
  const input = await helper('desktop_macos_installer', '_macosScript');
  const result = spawnSync('/bin/sh', ['-n'], { input, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});

test('Windows updater helper parses without executing installation', {
  skip: process.platform !== 'win32',
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tuturuuu-updater-syntax-'));
  try {
    const file = join(directory, 'installer.ps1');
    await writeFile(file, await helper('desktop_installer', '_windowsScript'));
    const result = spawnSync(
      'pwsh',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        '$tokens=$null; $errors=$null; [System.Management.Automation.Language.Parser]::ParseFile($env:TUTURUUU_UPDATER_SCRIPT,[ref]$tokens,[ref]$errors) > $null; if ($errors.Count -gt 0) { $errors | ForEach-Object { $_.Message }; exit 1 }',
      ],
      {
        encoding: 'utf8',
        env: { ...process.env, TUTURUUU_UPDATER_SCRIPT: file },
      }
    );
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('Linux restart waits for the previous process to exit', {
  skip: process.platform === 'win32',
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tuturuuu-restart-test-'));
  const parent = spawn('/bin/sleep', ['30']);
  const done = once(parent, 'exit');
  let restart;
  try {
    const script = join(directory, 'relaunch.sh');
    const executable = join(directory, 'app.sh');
    await writeFile(script, await helper('desktop_installer', '_linuxScript'));
    await writeFile(executable, '#!/bin/sh\ntouch "$0.done"\n', {
      mode: 0o700,
    });
    restart = spawn('/bin/sh', [script, String(parent.pid), executable]);
    const restarted = once(restart, 'exit');
    await setTimeout(100);
    await assert.rejects(access(`${executable}.done`));
    parent.kill('SIGTERM');
    await done;
    const [code] = await restarted;
    assert.equal(code, 0);
    await access(`${executable}.done`);
  } finally {
    parent.kill();
    restart?.kill();
    await rm(directory, { recursive: true, force: true });
  }
});
