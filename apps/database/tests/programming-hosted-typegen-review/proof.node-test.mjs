import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { buildLocalProof, main } from './proposal.mjs';

const types = Buffer.from(
  'export type Database = {\n  public: { Tables: {} }\n  private: { Tables: {} }\n  storage: { Tables: {} }\n}\n'
);
const state = {
  runSucceeded: true,
  cleanupVerified: true,
  images: { synthetic: 'sha256:synthetic-only' },
  metadata: { headSha: 'a'.repeat(40), projectId: 'tt-synthetic' },
  cliVersion: 'synthetic',
  migrationFingerprint: 'b'.repeat(64),
};
test('local proof retains hashes and provenance without embedding generated contents', () => {
  const proof = buildLocalProof(state, types);
  assert.equal(proof.typesBytes, types.length);
  assert.match(proof.typesSha256, /^[a-f0-9]{64}$/);
  assert.equal(proof.headSha, state.metadata.headSha);
  assert.deepEqual(proof.images, state.images);
  assert.equal(JSON.stringify(proof).includes('export type'), false);
});
test('local validation still requires successful lifecycle, cleanup and schema sections', () => {
  for (const changed of [
    { ...state, runSucceeded: false },
    { ...state, cleanupVerified: false },
    { ...state, images: {} },
  ]) {
    assert.throws(() => buildLocalProof(changed, types), /No successful/);
  }
  assert.throws(
    () => buildLocalProof(state, Buffer.alloc(0)),
    /declaration missing/
  );
  assert.throws(
    () => buildLocalProof(state, Buffer.from('export type Database = {}')),
    /schema declaration missing/
  );
});
test('inert candidate has no upload/output channels and invokes only local validation', () => {
  const workflow = readFileSync(
    'apps/database/tests/programming-hosted-typegen-review/workflow.yaml.txt',
    'utf8'
  );
  assert.equal(
    /upload-artifact|GITHUB_STEP_SUMMARY|actions\/cache|GITHUB_OUTPUT/.test(
      workflow
    ),
    false
  );
  assert.match(workflow, /proposal\.mjs validate/);
  assert.equal(/proposal\.mjs artifact/.test(workflow), false);
});
test('removed artifact mode cannot become an accidental export path', async () => {
  await assert.rejects(
    main('artifact'),
    /Expected prepare, run, cleanup, or validate/
  );
});
