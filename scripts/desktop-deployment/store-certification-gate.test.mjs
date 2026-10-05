import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const gate = fileURLToPath(
  new URL('./store-certification-gate.ps1', import.meta.url)
);
const verifier = await readFile(
  new URL('./verify-windows-store.ps1', import.meta.url),
  'utf8'
);
const workflow = await readFile(
  new URL('../../.github/workflows/desktop-store-draft.yaml', import.meta.url),
  'utf8'
);

test('Store verification defaults to submission mode and invokes the WACK prerequisite gate', () => {
  assert.match(verifier, /\[switch\]\$DiagnosticsOnly/);
  assert.match(
    verifier,
    /\. \(Join-Path \$PSScriptRoot 'store-certification-gate\.ps1'\)/
  );
  assert.match(
    verifier,
    /if \(Test-WindowsStoreCertificationPrerequisites[^\n]+-DiagnosticsOnly:\$DiagnosticsOnly\) \{/
  );
  assert.match(
    verifier,
    /if \(\$LASTEXITCODE -ne 0\) \{ throw 'Windows App Certification Kit reported a failure' \}/
  );
  assert.match(verifier, /GetAttribute\('OVERALL_RESULT'\) -ne 'PASS'/);
});

test('workflow carries explicit diagnostic input and never uploads diagnostic MSIX', () => {
  assert.match(
    workflow,
    /STORE_DIAGNOSTICS_ONLY: \$\{\{ inputs\.diagnostics_only \}\}/
  );
  assert.match(
    workflow,
    /-DiagnosticsOnly:\(\$env:STORE_DIAGNOSTICS_ONLY -eq 'true'\)/
  );
  assert.match(
    workflow,
    /name: Upload production submission package\n\s+if: success\(\) && !inputs\.diagnostics_only/
  );
  assert.match(
    workflow,
    /name: Upload Windows validation evidence\n\s+if: always\(\)/
  );
  assert.match(workflow, /'store-certification-gate\.ps1'/);
});

for (const fixture of [
  {
    name: 'missing kit blocks submission',
    kit: false,
    session: 1,
    diagnostics: false,
    status: 1,
    blocked: true,
  },
  {
    name: 'non-interactive session blocks submission',
    kit: true,
    session: 0,
    diagnostics: false,
    status: 1,
    blocked: true,
  },
  {
    name: 'missing kit allows diagnostic evidence only',
    kit: false,
    session: 1,
    diagnostics: true,
    status: 0,
    blocked: true,
  },
  {
    name: 'non-interactive session allows diagnostic evidence only',
    kit: true,
    session: 0,
    diagnostics: true,
    status: 0,
    blocked: true,
  },
  {
    name: 'interactive kit continues submission verification',
    kit: true,
    session: 1,
    diagnostics: false,
    status: 0,
    blocked: false,
  },
  {
    name: 'interactive kit continues diagnostic verification',
    kit: true,
    session: 1,
    diagnostics: true,
    status: 0,
    blocked: false,
  },
]) {
  test(fixture.name, { skip: process.platform !== 'win32' }, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tuturuuu-wack-gate-'));
    try {
      const kit = join(directory, 'appcert.exe');
      if (fixture.kit) await writeFile(kit, 'fixture only; never executed');
      const invocation = join(directory, 'test.ps1');
      await writeFile(
        invocation,
        `
$ErrorActionPreference = 'Stop'
. $env:WACK_GATE_SCRIPT
try {
  $ready = Test-WindowsStoreCertificationPrerequisites -KitPath $env:WACK_GATE_KIT -SessionId ${fixture.session} -ReportDirectory $env:WACK_GATE_REPORT -DiagnosticsOnly:$${fixture.diagnostics}
  if ($ready -ne $${!fixture.blocked}) { throw 'Unexpected prerequisite decision' }
} catch { Write-Error $_ -ErrorAction Continue; exit 1 }
`
      );
      const result = spawnSync(
        'pwsh',
        ['-NoProfile', '-NonInteractive', '-File', invocation],
        {
          encoding: 'utf8',
          env: {
            ...process.env,
            WACK_GATE_SCRIPT: gate,
            WACK_GATE_KIT: kit,
            WACK_GATE_REPORT: directory,
          },
        }
      );
      assert.equal(
        result.status,
        fixture.status,
        result.error?.message || result.stderr || result.stdout
      );
      if (fixture.blocked) {
        assert.match(
          await readFile(join(directory, 'wack-blocked.txt'), 'utf8'),
          /BLOCKED: WACK/
        );
      } else {
        await assert.rejects(readFile(join(directory, 'wack-blocked.txt')));
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
}
