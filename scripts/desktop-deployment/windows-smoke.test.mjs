import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

function assertFirstFrameGate(windowSource, flutterSource) {
  const creation = windowSource.match(
    /HWND window = CreateWindow\([\s\S]*?\);/
  )?.[0];
  assert.ok(creation, 'Find the runner window creation');
  assert.doesNotMatch(
    creation,
    /WS_VISIBLE/,
    'Window must remain hidden before Flutter renders'
  );
  assert.match(
    flutterSource,
    /SetNextFrameCallback\(\[this\]\(\) \{\s*ShowWindow\(GetHandle\(\), SW_SHOWNORMAL\);\s*\}\);/
  );
  assert.ok(
    flutterSource.indexOf('ForceRedraw()') >
      flutterSource.indexOf('SetNextFrameCallback')
  );
}

test('Windows runner exposes its window only after a Flutter frame', async () => {
  const root = new URL('../../apps/mobile/windows/runner/', import.meta.url);
  const windowSource = await readFile(
    new URL('win32_window.cpp', root),
    'utf8'
  );
  const flutterSource = await readFile(
    new URL('flutter_window.cpp', root),
    'utf8'
  );
  assertFirstFrameGate(windowSource, flutterSource);
  assert.throws(
    () =>
      assertFirstFrameGate(
        windowSource.replace(
          'WS_OVERLAPPEDWINDOW,',
          'WS_OVERLAPPEDWINDOW | WS_VISIBLE,'
        ),
        flutterSource
      ),
    /Window must remain hidden/
  );
});

const fixture = `
$ErrorActionPreference = 'Stop'
$global:SmokeChildEnvironmentClean = $true
function Start-Sleep { param($Seconds) }
function Stop-Process { param($Id, [switch]$Force) }
function Start-Process {
    param($FilePath, $ArgumentList, $WorkingDirectory, [switch]$Wait, [switch]$PassThru)
    foreach ($name in @('ACTIONS_ID_TOKEN_REQUEST_URL', 'ACTIONS_ID_TOKEN_REQUEST_TOKEN', 'ACTIONS_RUNTIME_TOKEN')) {
        if ([Environment]::GetEnvironmentVariable($name, 'Process')) { $global:SmokeChildEnvironmentClean = $false }
    }
    if ($FilePath.EndsWith('setup.exe')) {
        $root = ($ArgumentList | Where-Object { $_.StartsWith('/DIR=') }).Substring(5).Trim('"')
        New-Item -ItemType Directory -Path (Join-Path $root 'data/flutter_assets') -Force > $null
        foreach ($name in @('tuturuuu.exe', 'flutter_windows.dll', 'data/icudtl.dat', 'data/app.so', 'data/flutter_assets/fixture.txt', 'unins000.exe')) {
            Set-Content (Join-Path $root $name) 'fixture'
        }
        if ($env:SMOKE_SCENARIO -eq 'unexpected-file') { Set-Content (Join-Path $root 'private.pdb.bak') 'fixture' }
        return [pscustomobject]@{ ExitCode = 0 }
    }
    if ($FilePath.EndsWith('unins000.exe')) {
        return [pscustomobject]@{ ExitCode = $(if ($env:SMOKE_SCENARIO -eq 'hidden-cleanup-failure') { 9 } else { 0 }) }
    }
    $visible = !$env:SMOKE_SCENARIO.StartsWith('hidden')
    $process = [pscustomobject]@{ Id = 123; HasExited = $false; MainWindowHandle = $(if ($visible) { 42 } else { 0 }); ExitCode = 0 }
    $process | Add-Member -MemberType ScriptMethod -Name Refresh -Value {}
    $process | Add-Member -MemberType ScriptMethod -Name WaitForExit -Value { param($Milliseconds) $true }
    return $process
}
$message = $null
try { & $env:TUTURUUU_SMOKE_SCRIPT; $status = 'passed' } catch { $status = 'failed'; $message = $_.Exception.Message }
[ordered]@{ status = $status; message = $message; childEnvironmentClean = $global:SmokeChildEnvironmentClean } | ConvertTo-Json | Set-Content (Join-Path $env:RUNNER_TEMP 'result.json')
`;

for (const scenario of [
  'visible',
  'hidden',
  'hidden-cleanup-failure',
  'unexpected-file',
  'tampered-receipt',
]) {
  test(`Windows smoke fixture: ${scenario}`, {
    skip: process.platform !== 'win32',
  }, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tuturuuu-smoke-test-'));
    try {
      const artifacts = join(directory, 'desktop-artifacts');
      await mkdir(artifacts);
      const bytes = Buffer.from('synthetic installer');
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      await writeFile(join(artifacts, 'Tuturuuu-windows-x64-setup.exe'), bytes);
      await writeFile(
        join(artifacts, 'verified-windows.json'),
        JSON.stringify({
          sha256: scenario === 'tampered-receipt' ? '0'.repeat(64) : sha256,
          source: '1'.repeat(40),
          run: '1234',
        })
      );
      const script = join(directory, 'fixture.ps1');
      await writeFile(script, fixture);
      const result = spawnSync('pwsh', ['-NoProfile', '-File', script], {
        encoding: 'utf8',
        timeout: 20000,
        env: {
          ...process.env,
          RUNNER_TEMP: directory,
          GITHUB_SHA: '1'.repeat(40),
          GITHUB_RUN_ID: '1234',
          GITHUB_RUN_ATTEMPT: '2',
          TUTURUUU_SMOKE_SCRIPT: resolve(
            'scripts/desktop-deployment/smoke-windows.ps1'
          ),
          SMOKE_SCENARIO: scenario,
          ACTIONS_ID_TOKEN_REQUEST_URL: 'synthetic',
          ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'synthetic',
          ACTIONS_RUNTIME_TOKEN: 'synthetic',
        },
      });
      assert.equal(result.status, 0, result.stderr || result.stdout);
      const observed = JSON.parse(
        (await readFile(join(directory, 'result.json'), 'utf8')).replace(
          /^\uFEFF/,
          ''
        )
      );
      assert.equal(observed.childEnvironmentClean, true);
      if (scenario === 'visible') {
        assert.equal(observed.status, 'passed', observed.message);
        const inventory = JSON.parse(
          (
            await readFile(
              join(directory, 'windows-installed-files.json'),
              'utf8'
            )
          ).replace(/^\uFEFF/, '')
        );
        assert.equal(inventory.installerSha256, sha256);
        assert.equal(inventory.attempt, '2');
        assert.ok(
          inventory.files.every((file) => /^[a-f0-9]{64}$/.test(file.sha256))
        );
      } else {
        assert.equal(observed.status, 'failed');
        assert.match(
          observed.message,
          scenario === 'unexpected-file'
            ? /Unexpected installed file/
            : scenario === 'tampered-receipt'
              ? /Installer does not match/
              : /did not render its first frame/
        );
        if (scenario === 'hidden-cleanup-failure')
          assert.match(
            result.stdout,
            /Cleanup also failed: Uninstaller failed: 9/
          );
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
}
