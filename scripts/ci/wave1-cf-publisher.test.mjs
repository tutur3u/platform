import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cfPrebuiltArgs,
  parseCfVersionId,
} from './cf-build-output-publisher.mjs';

test('cfPrebuiltArgs version-only never provisions traffic', () => {
  const args = cfPrebuiltArgs({
    traffic: 'version-only',
    dryRun: false,
    sha: 'a'.repeat(40),
    digest: 'b'.repeat(64),
    workerName: 'tuturuuu-gateway',
  });
  assert.deepEqual(args, [
    'x',
    '--no-install',
    'cf',
    'workers',
    'versions',
    'create',
    '--prebuilt',
    '--worker',
    'tuturuuu-gateway',
    '--message',
    'a'.repeat(40),
    '--tag',
    'b'.repeat(64),
  ]);
});

test('cfPrebuiltArgs activate dry-run matches production qualification', () => {
  const args = cfPrebuiltArgs({
    traffic: 'activate',
    dryRun: true,
    sha: 'a'.repeat(40),
    digest: 'c',
    workerName: 'w',
  });
  assert.ok(args.includes('deploy'));
  assert.ok(args.includes('--dry-run'));
  assert.ok(args.includes('--no-provision'));
  assert.equal(args.includes('versions'), false);
});

test('parseCfVersionId reads cf stdout', () => {
  assert.equal(
    parseCfVersionId('Worker Version ID: 22222222-2222-2222-2222-222222222222'),
    '22222222-2222-2222-2222-222222222222'
  );
});
