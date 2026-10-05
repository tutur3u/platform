import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  provenanceVerificationArgs,
  verifyProvenance,
} from './verify-provenance.mjs';

const source = 'a'.repeat(40);
test('verifies Linux bytes against the exact protected workflow identity', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'desktop-provenance-'));
  const name = 'Tuturuuu-linux-x64.deb';
  try {
    await writeFile(join(directory, name), 'package');
    await writeFile(
      join(directory, 'verified-linux.json'),
      JSON.stringify({
        platform: 'linux',
        name,
        source,
        run: '123',
        verification: 'deb-package-verified',
        sha256: createHash('sha256').update('package').digest('hex'),
      })
    );
    const calls = [];
    await verifyProvenance(directory, source, '123', 'linux', (args) =>
      calls.push(args)
    );
    assert.deepEqual(calls, [
      [
        'attestation',
        'verify',
        join(directory, name),
        '--repo',
        'tutur3u/platform',
        '--signer-workflow',
        'tutur3u/platform/.github/workflows/desktop-beta.yaml',
        '--source-ref',
        'refs/heads/production',
        '--source-digest',
        source,
        '--deny-self-hosted-runners',
      ],
    ]);
    await assert.rejects(
      verifyProvenance(directory, source, '123', 'linux', () => {
        throw new Error('invalid signing identity');
      }),
      /invalid signing identity/
    );
    await writeFile(join(directory, name), 'modified');
    await assert.rejects(
      verifyProvenance(directory, source, '123', 'linux', () => {
        assert.fail('tampered bytes must fail before provenance lookup');
      }),
      /does not match/
    );
  } finally {
    await rm(directory, { recursive: true });
  }
});

test('rejects an unpinned source identity', () => {
  assert.throws(
    () => provenanceVerificationArgs('package.deb', 'production'),
    /exact source SHA/
  );
});
