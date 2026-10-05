import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const workflow = await readFile(
  new URL('../../.github/workflows/desktop-store-draft.yaml', import.meta.url),
  'utf8'
);
const packageSection = workflow.split('  package:\n')[1];
const jobCondition = packageSection.match(/^ {4}if: (.+)$/m)[1];
const submissionSection = packageSection
  .split('- name: Upload production submission package')[1]
  .split('- name: Remove public build input')[0];
const submissionCondition = submissionSection.match(/^ {8}if: (.+)$/m)[1];
function allowed(ref, diagnosticsOnly, shouldRun = 'true') {
  return runInNewContext(
    jobCondition.replace('needs.check-ci', 'needs["check-ci"]'),
    {
      github: { ref },
      inputs: { diagnostics_only: diagnosticsOnly },
      needs: { 'check-ci': { outputs: { should_run: shouldRun } } },
    }
  );
}

test('manual diagnostics require trusted main or production and enabled CI', () => {
  assert.equal(allowed('refs/heads/main', true), true);
  assert.equal(allowed('refs/heads/main', false), false);
  assert.equal(allowed('refs/heads/production', false), true);
  assert.equal(allowed('refs/heads/production', true), true);
  for (const ref of [
    'refs/heads/feat/test',
    'refs/pull/42/merge',
    'refs/tags/v1',
  ]) {
    assert.equal(allowed(ref, true), false);
  }
  assert.equal(allowed('refs/heads/main', true, 'false'), false);
  assert.equal(allowed('refs/heads/main', true, ''), false);
});

test('diagnostic or failed runs cannot upload a submission MSIX', () => {
  for (const success of [true, false]) {
    for (const diagnosticsOnly of [true, false]) {
      assert.equal(
        runInNewContext(submissionCondition, {
          success: () => success,
          inputs: { diagnostics_only: diagnosticsOnly },
        }),
        success && !diagnosticsOnly
      );
    }
  }
  assert.match(submissionSection, /path:.*store-draft\/\*\.msix/);
});

test('diagnostics retain strict certification and failure evidence without publication privileges', () => {
  assert.match(
    workflow,
    /permissions:\n {2}contents: read\n {2}deployments: read/
  );
  assert.doesNotMatch(workflow, /(?:contents|deployments|id-token): write/);
  assert.match(
    workflow,
    /diagnostics_only:[\s\S]*?type: boolean\n {8}default: false/
  );
  const verifySection = packageSection
    .split(
      '- name: Validate installed Store package and certification report'
    )[1]
    .split('- name: Upload Windows validation evidence')[0];
  assert.match(verifySection, /verify-windows-store\.ps1/);
  assert.doesNotMatch(verifySection, /continue-on-error/);
  const evidenceSection = packageSection
    .split('- name: Upload Windows validation evidence')[1]
    .split('- name: Upload production submission package')[0];
  assert.match(evidenceSection, /if: always\(\)/);
  assert.match(evidenceSection, /path:.*store-validation\/\*/);
  assert.match(evidenceSection, /retention-days: 7/);
  assert.deepEqual(
    [...workflow.matchAll(/^ {2}([\w-]+):$/gm)].map((match) => match[1]),
    ['workflow_dispatch', 'check-ci', 'package']
  );
});

test('diagnostics use a separate environment without broadening release access', () => {
  const expression = packageSection.match(
    /^ {4}environment: \$\{\{ (.+) \}\}$/m
  )[1];
  for (const ref of ['refs/heads/main', 'refs/heads/production']) {
    for (const diagnosticsOnly of [true, false]) {
      assert.equal(
        runInNewContext(expression, {
          github: { ref },
          inputs: { diagnostics_only: diagnosticsOnly },
        }),
        ref === 'refs/heads/main' && diagnosticsOnly
          ? 'desktop-diagnostics'
          : 'desktop-beta'
      );
    }
  }
});
