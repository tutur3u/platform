const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { readStagingProof } = require('./fixtures/staging-proof-source.cjs');

const workflow = readFileSync(
  path.join(__dirname, '../../.github/workflows/supabase-production.yaml'),
  'utf8'
);
const command = 'node scripts/ci/verify-staging-migration-marker.mjs';

test('proof readers use the exact extracted source and retain its invocation', () => {
  const { source, code, commandIndex } = readStagingProof(workflow);
  assert.equal(
    source,
    readFileSync(
      path.join(__dirname, 'verify-staging-migration-marker.mjs'),
      'utf8'
    )
  );
  assert.ok(code.includes('async function main()'));
  assert.ok(!code.includes('async function persistResult('));
  assert.equal(commandIndex, workflow.indexOf(command));
});

for (const [name, mutate] of [
  ['missing invocation', (text) => text.replace(command, 'true')],
  ['duplicate invocation', (text) => `${text}\n${command}\n`],
  [
    'eligibility before proof',
    (text) => text.replace(command, `SHOULD_DEPLOY=true\n${command}`),
  ],
]) {
  test(`proof readers reject ${name}`, () => {
    assert.throws(() => readStagingProof(mutate(workflow)));
  });
}
