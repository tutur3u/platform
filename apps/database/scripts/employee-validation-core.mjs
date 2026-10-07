import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  admissionProfile,
  verifyDedicatedAdmission,
} from './employee-validation-supervisor.mjs';
import { assertStrictTap } from './programming-database-tap.mjs';

export { verifyHostBudget } from './employee-validation-host.mjs';

import { protectedBaseline } from './employee-validation-host.mjs';
import { rewriteSupabaseConfig } from './run-supabase-isolated.js';

export const sha256 = (bytes) =>
  createHash('sha256').update(bytes).digest('hex');
export const employeeDrafts = [
  'supabase/migrations/20261008020000_employee_creation_identity.sql',
  'supabase/migrations/20261008020100_employee_creation_finalization.sql',
  'supabase/migrations/20261008020200_employee_restoration.sql',
  'supabase/tests/employee-signup-guards.sql',
  'supabase/tests/employee-administrator.sql',
  'supabase/tests/employee-finalization.sql',
  'supabase/tests/employee-identity-contract.sql',
  'supabase/tests/employee-restoration.sql',
].map((name) => `apps/database/${name}`);
export const expectedTapCounts = Object.freeze({
  'employee-signup-guards.sql': 25,
  'employee-administrator.sql': 20,
  'employee-finalization.sql': 34,
  'employee-identity-contract.sql': 52,
  'employee-restoration.sql': 41,
});
export const packets = Object.keys(expectedTapCounts).map(
  (name) => `apps/database/supabase/tests/${name}`
);
export function verifyPacketCounts(counts) {
  assert.deepEqual(
    counts,
    expectedTapCounts,
    'Exact employee packet counts required'
  );
}
export const runtimeFiles = [
  'verify-employee-validation.mjs',
  'employee-validation-core.mjs',
  'employee-validation-command.mjs',
  'employee-validation-host.mjs',
  'employee-validation-resources.mjs',
  'employee-validation-supervisor.mjs',
  'employee-validation-dependencies.mjs',
  'employee-validation-types.ts',
  'run-supabase.js',
  'run-supabase-isolated.js',
  'run-supabase-isolated-typegen.js',
  'atomic-file.js',
  'programming-database-tap.mjs',
].map((name) => `apps/database/scripts/${name}`);

export function closedTap(output, expectedCount) {
  assertStrictTap(output);
  assert.deepEqual(
    output
      .split(/\r?\n/u)
      .filter((line) => /^(BEGIN|COMMIT|ROLLBACK)$/u.test(line)),
    ['BEGIN', 'ROLLBACK'],
    'SQL packet did not close exactly one rollback transaction'
  );
  assert.equal(output.trim().split(/\r?\n/u).at(-1), 'ROLLBACK');
  const count = Number([...output.matchAll(/^1\.\.(\d+)$/gmu)][0][1]);
  assert.equal(count, expectedCount, 'Frozen assertion count changed');
  return count;
}

export function regularOwnedFile(root, relative) {
  assert(!path.isAbsolute(relative) && !relative.split('/').includes('..'));
  let target = root;
  for (const segment of relative.split('/')) {
    target = path.join(target, segment);
    assert(!lstatSync(target).isSymbolicLink(), `Source symlink: ${relative}`);
  }
  assert(lstatSync(target).isFile());
  return readFileSync(target);
}

export function verifySources(root, manifest, tracked, untracked, head) {
  assert.equal(manifest.version, 1);
  assert.equal(manifest.headSha, head);
  assert.deepEqual(manifest.ownedDrafts, employeeDrafts);
  const entries = new Map();
  for (const entry of manifest.files) {
    assert.match(entry.path, /^apps\/database\/(scripts|supabase)\//u);
    assert(!entries.has(entry.path), 'Duplicate source');
    assert.equal(
      sha256(regularOwnedFile(root, entry.path)),
      entry.sha256,
      `Source drift: ${entry.path}`
    );
    entries.set(entry.path, entry.sha256);
  }
  const required = new Set([...tracked, ...employeeDrafts, ...runtimeFiles]);
  assert.deepEqual(
    new Set(entries.keys()),
    required,
    'Source manifest omissions or extra paths'
  );
  for (const file of untracked)
    assert(employeeDrafts.includes(file), `Unowned SQL draft: ${file}`);
  const changed = execFileSync(
    'git',
    [
      'diff',
      '--no-ext-diff',
      'HEAD',
      '--name-only',
      '--',
      'apps/database/supabase',
    ],
    { cwd: root, encoding: 'utf8', timeout: 10000 }
  )
    .split('\n')
    .filter(Boolean);
  for (const file of changed)
    assert(employeeDrafts.includes(file), `Unowned historical drift: ${file}`);
  return [...new Set([...tracked, ...employeeDrafts])].sort();
}

export function verifyStaged(root, metadata, files, context = null) {
  context?.budget();
  for (const file of files) {
    const original = regularOwnedFile(root, file);
    const expected = file.endsWith('/config.toml')
      ? Buffer.from(
          context
            ? context.lease.binding.supervisor.configBytes
            : rewriteSupabaseConfig(original.toString(), metadata)
        )
      : original;
    const actual = regularOwnedFile(
      metadata.disposableRoot,
      file.slice('apps/database/'.length)
    );
    assert(actual.equals(expected), `Staged byte mismatch: ${file}`);
  }
}

export const cliCommit = '21db855916f2c2b12f61cde923a27094b8528b23';
export const imageSelectionSource = `https://github.com/supabase/cli/blob/${cliCommit}/apps/cli-go/pkg/config/templates/Dockerfile`;
export const imagePins = {
  postgres: 'postgres:17.6.1.167',
  pgmeta: 'postgres-meta:v0.99.0',
  authBootstrap: 'gotrue:v2.196.0',
  realtimeBootstrap: 'realtime:v2.130.0',
  storageBootstrap: 'storage-api:v1.72.1',
};
// Admission is reviewed externally. A JSON boolean is never user authorization.
export function verifyAdmission(admission, manifestHash, now = Date.now()) {
  const profile = admissionProfile(admission);
  if (profile === 'dedicated') verifyDedicatedAdmission(admission);
  assert.equal(admission.phase, 'employee-historical-sql-and-types');
  assert.equal(admission.sourceManifestSha256, manifestHash);
  assert.equal(admission.rootReviewedDriver, true);
  assert.equal(admission.rootReviewedCleanup, true);
  assert.equal(admission.rootApprovedStartup, true);
  assert.equal(admission.rootReviewedImageSelection, true);
  assert.match(admission.reviewReceiptSha256, /^[a-f0-9]{64}$/u);
  assert(Number.isFinite(now));
  assert(now < Date.parse(admission.expiresAt), 'Expired startup admission');
  assert(
    Date.parse(admission.expiresAt) - now <= 3600000,
    'Admission window exceeds one hour'
  );
  if (profile === 'shared') {
    assert.equal(admission.host.policy, 'authorized-shared32-protected16');
    assert.match(admission.host.machineId, /^[a-f0-9]{32}$/u);
    assert.equal(admission.host.dockerSocket, '/var/run/docker.sock');
    assert.equal(admission.host.minAvailableBytes, 16 * 1024 ** 3);
    assert.deepEqual(admission.host.protectedBaseline, protectedBaseline);
  }
  assert.equal(admission.cliSourceCommit, cliCommit);
  assert.deepEqual(
    admission.images.map((image) => image.role).sort(),
    Object.keys(imagePins).sort()
  );
  for (const image of admission.images) {
    const pin = imagePins[image.role];
    assert(
      [`public.ecr.aws/supabase/${pin}`, `ghcr.io/supabase/${pin}`].includes(
        image.reference
      ),
      'Wrong selected image pin'
    );
    assert.match(image.id, /^sha256:[a-f0-9]{64}$/u);
    assert.match(image.digest, /^.+@sha256:[a-f0-9]{64}$/u);
    assert.equal(image.digest.split('@')[0], image.reference.split(':')[0]);
    assert.equal(image.cliSelectionSource, imageSelectionSource);
  }
  assert.match(admission.dependencyIdentitySha256, /^[a-f0-9]{64}$/u);
  assert(
    admission.dependencyIdentity?.packages?.length > 0,
    'Missing frozen installed dependencies'
  );
  assert.equal(
    sha256(JSON.stringify(admission.dependencyIdentity)),
    admission.dependencyIdentitySha256
  );
  assert.match(admission.cliBinarySha256, /^[a-f0-9]{64}$/u);
  verifyPacketCounts(admission.tapCounts);
}
