// REV-6459-6: supabase-production.yaml accepts a staging migration marker only
// from producer revisions whose supabase-staging.yaml blob is allowlisted.
// The list holds the current blob plus blobs from main's history (and #6453,
// the base of this stack); blobs from rejected or intermediate branch heads
// must not linger, so the list is pinned exactly.
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file));

function gitBlob(bytes) {
  return createHash('sha1')
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest('hex');
}

test('the staging contract allowlist is exactly current plus main history', () => {
  const production = read(
    '.github/workflows/supabase-production.yaml'
  ).toString('utf8');
  const match = /\[workflowPath, \[([^\]]*)\]\]/u.exec(production);
  assert.ok(match, 'staging contract allowlist not found');
  const allowed = [...match[1].matchAll(/'([0-9a-f]{40})'/gu)].map(
    ([, sha]) => sha
  );
  const current = gitBlob(read('.github/workflows/supabase-staging.yaml'));
  assert.deepEqual(allowed, [
    // main: preserve pending protected workflow runs (legacy fixture)
    'c80066e1cd038fcda3bd6c1a79c0b12993b94b49',
    // main: preserve exact-target staging evidence
    '70937258932e55cf611c2896b788da0392c09717',
    // main: #6453 same-repository push for workflow_run consumers
    '68449e684d33ca9608e6c873563ca3092543ca6c',
    // main: #6459 accepts any SHA reachable from main
    'ec2f81d196eff45ba05d2b87ad5bd1bb98b194da',
    current,
  ]);
  for (const rejected of [
    '8123f16d927bcac4075f4e01b520b7d8f5eec0b2',
    '9a3488316e0d13eccf7c5978791c04e5c0e07235',
    '7510bb52a80d475f768698aa47acdb34114956d7',
    '4ef3b2d74131a57cdab234244981886cf3bd3ad8',
  ]) {
    assert.ok(!allowed.includes(rejected), rejected);
  }
});
