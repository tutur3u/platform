import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  applicationId,
  assertDiskAdmission,
  renderIosProject,
  validateArtifactItems,
} from './prepare.mjs';

const artifacts = (content = '{}') => [
  ['proof-input.json', content],
  ['environment.json', content],
  ['native-proof.json', content],
];

test('Android ID stays unchanged; iOS has a separate valid bundle ID', () => {
  assert.equal(
    applicationId('android'),
    'dev.tuturuuu.fixture.sale_journal_fixture'
  );
  assert.equal(
    applicationId('ios'),
    'dev.tuturuuu.fixture.sale-journal-fixture'
  );
  assert.match(applicationId('ios'), /^[A-Za-z0-9.-]+$/);
  assert.throws(() => applicationId('web'));
});

test('generated iOS app and test bundle identifiers lose underscores', () => {
  const project =
    'PRODUCT_BUNDLE_IDENTIFIER = com.example.sale_journal_fixture;\n' +
    'PRODUCT_BUNDLE_IDENTIFIER = com.example.sale_journal_fixture.RunnerTests;';
  const rendered = renderIosProject(project);
  assert.equal(
    rendered,
    'PRODUCT_BUNDLE_IDENTIFIER = dev.tuturuuu.fixture.sale-journal-fixture;\n' +
      'PRODUCT_BUNDLE_IDENTIFIER = dev.tuturuuu.fixture.sale-journal-fixture.RunnerTests;'
  );
  assert.doesNotMatch(rendered, /sale_journal_fixture/);
});

test('disk floors reject just-below admission and admit the exact boundary', () => {
  for (const [platform, minimum] of [
    ['android', 20],
    ['ios', 12],
  ]) {
    assert.throws(() =>
      assertDiskAdmission(platform, '--preflight', minimum - 0.01)
    );
    assert.equal(
      assertDiskAdmission(platform, '--preflight', minimum),
      minimum
    );
    assert.throws(() =>
      assertDiskAdmission(platform, '--runtime-preflight', 3.99)
    );
    assert.equal(assertDiskAdmission(platform, '--runtime-preflight', 4), 4);
  }
  assert.throws(() => assertDiskAdmission('ios', '--preflight', NaN));
});

test('artifact byte caps count UTF8 and reject before writing any output', () => {
  assert.equal(validateArtifactItems(artifacts('a'.repeat(65_536))), 196_608);
  assert.throws(() => validateArtifactItems(artifacts('a'.repeat(65_537))));
  assert.throws(() => validateArtifactItems(artifacts('é'.repeat(32_769))));
});

test('artifact allowlist rejects raw logs, duplicate names and extra files', () => {
  assert.throws(() =>
    validateArtifactItems([...artifacts(), ['emulator.log', '{}']])
  );
  assert.throws(() =>
    validateArtifactItems([
      ['proof-input.json', '{}'],
      ['environment.json', '{}'],
      ['environment.json', '{}'],
    ])
  );
  assert.throws(() =>
    validateArtifactItems([
      ['proof-input.json', '{}'],
      ['environment.json', '{}'],
      ['pubspec.lock', '{}'],
    ])
  );
});

test('prepare and orchestrate share the platform-specific ID selector', () => {
  const driver = readFileSync(
    new URL('./orchestrate.mjs', import.meta.url),
    'utf8'
  );
  assert.match(driver, /const app = applicationId\(platform\)/);
  assert.doesNotMatch(
    driver,
    /const app = 'dev\.tuturuuu\.fixture\.sale_journal_fixture'/
  );
});

test('both jobs guard trusted main/actor and evaluate trusted config before candidate', () => {
  const proposal = readFileSync(
    new URL('./workflow-proposal.yaml', import.meta.url),
    'utf8'
  );
  assert.match(proposal, /permissions:\n {2}contents: read/);
  assert.doesNotMatch(proposal, /deployments:|secrets\.|^ {4}environment:/m);
  for (const job of proposal.split(/^ {2}(?:android|ios):$/m).slice(1)) {
    assert.match(job, /github\.ref == 'refs\/heads\/main'/);
    assert.match(job, /vars\.TRUSTED_PREVIEW_DEPLOY_ACTORS/);
    assert.match(
      job,
      /github\.event_name == 'workflow_dispatch'.*inputs\.admitted/
    );
    assert.ok(
      job.indexOf('github.workflow_sha') <
        job.indexOf('Evaluate trusted CI switchboard')
    );
    assert.ok(
      job.indexOf(
        'node --experimental-strip-types scripts/ci/check-workflow-config.ts'
      ) < job.search(/ref: \$\{\{ inputs\.source_sha \}\}/)
    );
    assert.match(
      job,
      /working-directory: trusted\n {8}env:\n {10}WORKFLOW_NAME:/
    );
    assert.match(job, /ci\[process\.env\.WORKFLOW_NAME\] !== true/);
    assert.match(
      job,
      /Check out reviewed candidate\n {8}if: steps\.trusted_config\.outputs\.should_run == 'true'/
    );
    assert.match(job, /timeout-minutes: 40/);
    assert.match(job, /timeout-minutes: 12/);
    assert.match(
      job,
      /always\(\) && steps\.trusted_config\.outputs\.should_run == 'true'/
    );
  }
});
