import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { validateEmployeeComposedManifest } from './employee-schema-composed-profile.mjs';
import {
  employeeQualificationExecutionReceipt,
  employeeQualificationHash,
  evaluateEmployeeQualificationPackets,
  observedEmployeeFile,
  observeEmployeeGitCommit,
  observeEmployeeQualification,
  qualificationControlPaths,
  reviewedMarkerSourceChain,
  selectEmployeeQualificationProfile,
  validateEmployeeReviewedMarkerManifest,
} from './employee-schema-qualification-profile.mjs';

const sourceRoot = process.env.EMPLOYEE_COMPOSED_SOURCE_FIXTURE_ROOT;
const sourceSha = process.env.EMPLOYEE_COMPOSED_SOURCE_FIXTURE_SHA;
const gitIdentity = observeEmployeeGitCommit(sourceRoot, sourceSha);
const controls = qualificationControlPaths.map((path) => ({
  path,
  sha256: employeeQualificationHash(path),
}));
const observationInput = (extra = {}) => ({
  repositoryRoot: sourceRoot,
  choice: 'composed',
  sourceSha,
  observedSourceSha: sourceSha,
  gitIdentity,
  authoritativeSourceSha: sourceSha,
  controlFiles: controls,
  expectedControlFiles: controls,
  ...extra,
});
const tap = (count) =>
  `BEGIN\n1..${count}\n${Array.from({ length: count }, (_, i) => `ok ${i + 1} - assertion`).join('\n')}\nROLLBACK\n`;
function composed() {
  assert.ok(
    sourceRoot,
    'The actual frozen composed source fixture must be supplied'
  );
  assert.match(sourceSha, /^[a-f0-9]{40}$/u);
  return observeEmployeeQualification(observationInput());
}
function packets(observation) {
  return observation.selected.packets.map((packet) => ({
    file: packet.file,
    sourceSha,
    sha256: packet.sha256,
    exitCode: 0,
    tap: tap(packet.assertions),
    assertions: packet.assertions,
  }));
}
test('foundation retains literal original 172 and composed selects literal 281', () => {
  const foundation = selectEmployeeQualificationProfile('foundation');
  assert.equal(foundation.name, 'employee-creation-foundation-v1');
  assert.deepEqual(
    foundation.packets.map((p) => p.assertions),
    [25, 20, 34, 52, 41]
  );
  const selected = selectEmployeeQualificationProfile('composed');
  assert.equal(selected.name, 'employee-creation-composed-reviewed-marker-v1');
  assert.equal(selected.packets.length, 7);
  assert.equal(selected.assertions, 281);
  for (const name of [
    undefined,
    '',
    'employee-creation-composed-v1',
    'unknown',
  ])
    assert.throws(() => selectEmployeeQualificationProfile(name));
});
test('actual full S bytes close old40, independent consumer5 and immutable profile2', () => {
  const observation = composed();
  assert.equal(observation.manifest.files.length, 40);
  assert.equal(observation.fullSourceManifest.files.length, 47);
  assert.notEqual(
    observation.sourceManifestSha256,
    observation.profileSourceManifestSha256
  );
  assert.equal(observation.consumers.files.length, 5);
  assert.equal(observation.sourceSha, sourceSha);
  for (const row of observation.manifest.files)
    assert.deepEqual(row, observedEmployeeFile(sourceRoot, row.path));
  assert.equal(observation.manifest.migrations.length, 5);
  assert.equal(
    observation.consumers.consumerCommit,
    '68a47c83c4ecc40f422749a6dd288b82a75441d6'
  );
});
for (const bad of [
  undefined,
  null,
  '',
  '0'.repeat(40),
  '84ec8e04c4a412c7dd1501f2bb7ce14c0dda01ea',
  '68a47c83c4ecc40f422749a6dd288b82a75441d6',
  'f'.repeat(40),
]) {
  test(`missing or substituted authoritative source is denied: ${String(bad)}`, () => {
    assert.throws(() =>
      observeEmployeeQualification(
        observationInput({ authoritativeSourceSha: bad })
      )
    );
    if (bad !== sourceSha)
      assert.throws(() =>
        observeEmployeeQualification(
          observationInput({ sourceSha: bad, authoritativeSourceSha: bad })
        )
      );
  });
}
for (const change of ['missing', 'extra', 'reordered', 'changed', 'extra-key'])
  test(`pre-run control bytes denied when ${change}`, () => {
    const rows = structuredClone(controls);
    if (change === 'missing') rows.pop();
    if (change === 'extra') rows.push(rows[0]);
    if (change === 'reordered') rows.reverse();
    if (change === 'changed') rows[0].sha256 = 'f'.repeat(64);
    if (change === 'extra-key') rows[0].qualified = true;
    assert.throws(() =>
      observeEmployeeQualification(observationInput({ controlFiles: rows }))
    );
  });
for (const group of ['files', 'migrations'])
  for (const change of ['missing', 'reordered', 'changed', 'duplicate'])
    test(`observed ${group} deny ${change}`, () => {
      const manifest = structuredClone(composed().manifest);
      if (change === 'missing') manifest[group].pop();
      if (change === 'reordered') manifest[group].reverse();
      if (change === 'changed') manifest[group][0].sha256 = 'f'.repeat(64);
      if (change === 'duplicate') manifest[group][1] = manifest[group][0];
      assert.throws(() =>
        validateEmployeeReviewedMarkerManifest(manifest, sourceSha, gitIdentity)
      );
    });
test('complete synthetic TAP validates transcripts and cannot qualify any layer', () => {
  const observed = composed();
  const receipt = evaluateEmployeeQualificationPackets(
    observed,
    packets(observed),
    0,
    true
  );
  assert.equal(receipt.assertions, 281);
  assert.equal(receipt.foundationAssertions, 172);
  assert.equal(receipt.additionalAssertions, 109);
  assert.equal(receipt.packetTranscriptValidated, true);
  for (const key of [
    'schemaQualified',
    'typesQualified',
    'consumerQualified',
    'catalogQualified',
    'runtimeQualified',
    'combinedQualified',
    'accountQualified',
    'productionApplied',
  ])
    assert.equal(receipt[key], false);
});
for (const change of [
  'partial',
  'exit',
  'skip',
  'todo',
  'closure',
  'hash',
  'source',
  'reordered',
])
  test(`seven-packet closure denies ${change}`, () => {
    const observed = composed(),
      rows = packets(observed);
    if (change === 'partial') rows.pop();
    if (change === 'exit') rows[6].exitCode = 1;
    if (change === 'skip')
      rows[6].tap = rows[6].tap.replace(
        'ok 1 - assertion',
        'ok 1 - assertion # SKIP'
      );
    if (change === 'todo')
      rows[6].tap = rows[6].tap.replace(
        'ok 1 - assertion',
        'ok 1 - assertion # TODO'
      );
    if (change === 'closure') rows[6].tap = rows[6].tap.replace('ROLLBACK', '');
    if (change === 'hash') rows[6].sha256 = 'f'.repeat(64);
    if (change === 'source') rows[6].sourceSha = 'f'.repeat(40);
    if (change === 'reordered') rows.reverse();
    assert.throws(() =>
      evaluateEmployeeQualificationPackets(observed, rows, 0, true)
    );
  });
test('foundation receipt preserves its own original packet contract', () => {
  const observed = observeEmployeeQualification(
    observationInput({ choice: 'foundation' })
  );
  const rows = observed.selected.packets.map(({ file, assertions }) => ({
    file,
    assertions,
  }));
  assert.equal(
    evaluateEmployeeQualificationPackets(observed, rows, 0, true).assertions,
    172
  );
  assert.equal(
    evaluateEmployeeQualificationPackets(observed, rows.slice(1), 0, true)
      .schemaQualified,
    false
  );
  assert.equal(
    evaluateEmployeeQualificationPackets(observed, rows, 1, true)
      .schemaQualified,
    false
  );
});
test('immutable source profile bytes remain unchanged in both receiver and S', () => {
  for (const [name, expected] of [
    [
      'employee-schema-composed-profile.mjs',
      'b00ae6f3f48f71dfd48a83f21c8de1765236b26f9c4032f77e5b361b4aca0b25',
    ],
    [
      'employee-schema-composed-profile.test.mjs',
      '47f820933c8ede8f03e16b61829f269171643af2c797b9c39073c10d22bf176f',
    ],
  ]) {
    assert.equal(
      employeeQualificationHash(readFileSync(new URL(name, import.meta.url))),
      expected
    );
    assert.equal(
      observedEmployeeFile(sourceRoot, `apps/database/scripts/${name}`).sha256,
      expected
    );
  }
});

test('partial execution produces a denied receipt suitable for failure persistence', () => {
  const observation = composed();
  const receipt = employeeQualificationExecutionReceipt(
    observation,
    packets(observation).slice(0, 6),
    1,
    false
  );
  assert.equal(receipt.schemaQualified, false);
  assert.equal(receipt.typesQualified, false);
  assert.equal(receipt.consumerQualified, false);
  assert.equal(receipt.catalogQualified, false);
  assert.equal(receipt.packetTranscriptValidated, false);
  assert.equal(receipt.sourceSha, sourceSha);
});

test('complete execution receipt retains transcript validation and false qualification', () => {
  const observation = composed();
  const receipt = employeeQualificationExecutionReceipt(
    observation,
    packets(observation),
    0,
    true
  );
  assert.equal(receipt.packetTranscriptValidated, true);
  assert.equal(receipt.schemaQualified, false);
  assert.equal(receipt.consumerQualified, false);
});

test('immutable V1 denies raw reviewed SQL row while the closed successor admits only the exact observed union', () => {
  const observed = composed();
  const { sourceChain, ...oldManifest } = structuredClone(observed.manifest);
  oldManifest.profile = 'employee-creation-composed-v1';
  assert.equal(
    oldManifest.files.find(
      (row) => row.path === reviewedMarkerSourceChain.delta.path
    ).sha256,
    reviewedMarkerSourceChain.delta.afterSha256
  );
  assert.throws(() => validateEmployeeComposedManifest(oldManifest, sourceSha));
  assert.equal(
    validateEmployeeReviewedMarkerManifest(
      observed.manifest,
      sourceSha,
      gitIdentity
    ).profile,
    reviewedMarkerSourceChain.profile
  );
  assert.deepEqual(sourceChain, reviewedMarkerSourceChain);
});
for (const change of [
  'missing-provenance',
  'changed-provenance',
  'wrong-parent',
  'wrong-tree',
  'descendant',
  'second-delta',
  'old-hash',
  'extra-row-key',
])
  test(`closed reviewed marker recipe denies ${change}`, () => {
    const manifest = structuredClone(composed().manifest),
      identity = { ...gitIdentity };
    if (change === 'missing-provenance') delete manifest.sourceChain.provenance;
    if (change === 'changed-provenance')
      manifest.sourceChain.provenance.markerReviewSha256 = 'f'.repeat(64);
    if (change === 'wrong-parent') identity.parentSha = 'f'.repeat(40);
    if (change === 'wrong-tree') identity.treeSha = 'f'.repeat(40);
    if (change === 'descendant') {
      identity.sourceSha = 'f'.repeat(40);
      manifest.sourceSha = identity.sourceSha;
    }
    if (change === 'second-delta') manifest.files[0].sha256 = 'f'.repeat(64);
    if (change === 'old-hash')
      manifest.files.find(
        (row) => row.path === reviewedMarkerSourceChain.delta.path
      ).sha256 = reviewedMarkerSourceChain.delta.beforeSha256;
    if (change === 'extra-row-key') manifest.files[0].approved = true;
    assert.throws(() =>
      validateEmployeeReviewedMarkerManifest(
        manifest,
        manifest.sourceSha,
        identity
      )
    );
  });
test('all provenance digests and actual Git tree/parent are bound independently of packet parsing', () => {
  assert.deepEqual(gitIdentity, {
    sourceSha: reviewedMarkerSourceChain.sourceSha,
    treeSha: reviewedMarkerSourceChain.treeSha,
    parentSha: reviewedMarkerSourceChain.parentSha,
  });
  assert.equal(Object.keys(reviewedMarkerSourceChain.provenance).length, 5);
  assert.ok(
    Object.values(reviewedMarkerSourceChain.provenance).every((value) =>
      /^[a-f0-9]{64}$/.test(value)
    )
  );
  assert.deepEqual(
    selectEmployeeQualificationProfile('composed').packets.map(
      (p) => p.assertions
    ),
    [25, 20, 34, 52, 41, 48, 61]
  );
});
