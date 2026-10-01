import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { collectArtifacts, writeArtifactItems } from './artifacts.mjs';
import { runBuild } from './build.mjs';
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

test('artifact byte caps count UTF8 at per-file and aggregate limits', () => {
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
      /^ {4}if: github\.event_name == 'workflow_dispatch'.*&& inputs\.admitted$/m
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

const temporary = (action) => {
  const directory = mkdtempSync(resolve(tmpdir(), 'journal-host-'));
  try {
    return action(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

test('oversized artifact rejection performs no directory or file writes', () =>
  temporary((directory) => {
    assert.throws(() =>
      writeArtifactItems(directory, artifacts('a'.repeat(65_537)))
    );
    assert.equal(existsSync(resolve(directory, 'artifacts')), false);
  }));

test('actual trusted gate emits true only for explicitly enabled registration', () => {
  const proposal = readFileSync(
    new URL('./workflow-proposal.yaml', import.meta.url),
    'utf8'
  );
  const root = fileURLToPath(new URL('../../', import.meta.url));
  for (const job of proposal.split(/^ {2}(?:android|ios):$/m).slice(1)) {
    const step = job.slice(
      job.indexOf('      - name: Evaluate trusted CI switchboard')
    );
    const script = /^ {8}run: \|\n([\s\S]*?)(?=^ {6}-)/m
      .exec(step)?.[1]
      .replace(/^ {10}/gm, '');
    assert.ok(script);
    for (const enabled of [true, false, 'missing', 'missing_output'])
      temporary((directory) => {
        mkdirSync(resolve(directory, 'scripts/ci'), { recursive: true });
        for (const file of [
          'tuturuuu.ts',
          'scripts/ci/check-workflow-config.ts',
          'scripts/ci/workflow-config-core.ts',
        ])
          copyFileSync(resolve(root, file), resolve(directory, file));
        writeFileSync(
          resolve(directory, 'tuturuuu.ci.ts'),
          `export const ci = ${enabled === 'missing' ? '{}' : `{'inventory-native-journal-proof.yaml':${enabled !== false}}`};`
        );
        writeFileSync(resolve(directory, 'package.json'), '{"type":"module"}');
        if (enabled === 'missing_output')
          writeFileSync(
            resolve(directory, 'scripts/ci/check-workflow-config.ts'),
            'process.exit(0);'
          );
        const output = resolve(directory, 'output');
        writeFileSync(output, '');
        const result = spawnSync('bash', ['-e', '-c', script], {
          cwd: directory,
          timeout: 10_000,
          encoding: 'utf8',
          env: {
            ...process.env,
            WORKFLOW_NAME: 'inventory-native-journal-proof.yaml',
            GITHUB_OUTPUT: output,
            GITHUB_EVENT_NAME: 'workflow_dispatch',
          },
        });
        assert.equal(
          result.status === 0,
          enabled === true,
          `${enabled}: ${result.stderr}`
        );
        if (enabled === true)
          assert.match(readFileSync(output, 'utf8'), /^should_run=true$/m);
        else
          assert.doesNotMatch(
            readFileSync(output, 'utf8'),
            /^should_run=true$/m
          );
      });
  }
});

test('admission assertion rejects inverted or missing positive job input', () => {
  const proposal = readFileSync(
    new URL('./workflow-proposal.yaml', import.meta.url),
    'utf8'
  );
  const pattern =
    /^ {4}if: github\.event_name == 'workflow_dispatch'.*&& inputs\.admitted$/m;
  for (const job of proposal.split(/^ {2}(?:android|ios):$/m).slice(1)) {
    assert.match(job, pattern);
    assert.doesNotMatch(
      job.replace('&& inputs.admitted', '&& !inputs.admitted'),
      pattern
    );
    assert.doesNotMatch(job.replace('&& inputs.admitted', ''), pattern);
  }
});

test('build failures identify the stage and exclude raw command diagnostics', () =>
  temporary((directory) => {
    const calls = [];
    const status = runBuild('android', directory, (_exe, args, options) => {
      calls.push({ args, options });
      return {
        status: 1,
        stdout: 'RAW_SECRET',
        stderr: 'RAW_SECRET',
        error: new Error('RAW_SECRET'),
      };
    });
    assert.deepEqual(status, { stage: 'pub_get', passed: false, exit_code: 1 });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.stdio, 'ignore');
    assert.equal(calls[0].options.timeout, 300_000);
    assert.doesNotMatch(
      readFileSync(resolve(directory, 'build-status.json'), 'utf8'),
      /RAW_SECRET/
    );
    let count = 0;
    assert.equal(
      runBuild('ios', directory, () => ({ status: count++ === 0 ? 0 : 2 }))
        .stage,
      'build'
    );
    assert.deepEqual(
      runBuild('ios', directory, () => ({ status: 0 })),
      { stage: 'complete', passed: true, exit_code: 0 }
    );
  }));

test('failed preparation and unavailable tools still yield bounded failure artifacts below disk floor', () =>
  temporary((directory) => {
    assert.equal(
      collectArtifacts('android', directory, {
        freeGiB: 0,
        command: () => {
          throw Error('RAW_SECRET');
        },
      }),
      false
    );
    for (const [name] of artifacts()) {
      const raw = readFileSync(resolve(directory, 'artifacts', name), 'utf8');
      assert.doesNotMatch(raw, /RAW_SECRET/);
      assert.ok(Buffer.byteLength(raw) <= 65_536);
    }
    const proof = JSON.parse(
      readFileSync(resolve(directory, 'artifacts/native-proof.json'))
    );
    assert.equal(proof.passed, false);
    assert.ok(proof.collection_errors.includes('input_unavailable'));
    assert.ok(proof.collection_errors.includes('native_proof_unavailable'));
  }));

test('complete collection whitelists metadata and requires all proof phases and versions', () =>
  temporary((directory) => {
    const input = {
      platform: 'android',
      source_sha: 'a'.repeat(40),
      run_id: '1-1-android',
      journal_sha256: 'b'.repeat(64),
    };
    writeFileSync(
      resolve(directory, 'proof-input.json'),
      JSON.stringify({ ...input, token: 'RAW_SECRET' })
    );
    writeFileSync(
      resolve(directory, 'pubspec.lock'),
      'packages:\n  flutter_secure_storage:\n    version: "11.1.1"\n'
    );
    writeFileSync(
      resolve(directory, 'build-status.json'),
      JSON.stringify({
        stage: 'complete',
        passed: true,
        exit_code: 0,
        log: 'RAW_SECRET',
      })
    );
    const proof = {
      ...input,
      passed: true,
      raw: 'RAW_SECRET',
      runtime: {
        api: '35',
        release: '15',
        abi: 'x86_64',
        emulator_version: '35.1',
        adb_version: '1.0',
      },
      phases: ['write', 'read', 'cleanup', 'verify-clean'].map(
        (phase, index) => ({
          ...input,
          phase,
          passed: true,
          process_id: index + 1,
          raw: 'RAW_SECRET',
        })
      ),
    };
    writeFileSync(
      resolve(directory, 'native-proof.json'),
      JSON.stringify(proof)
    );
    const command = (exe) =>
      exe === 'flutter'
        ? JSON.stringify({
            frameworkVersion: '3.47.0',
            dartSdkVersion: '3.12.0',
            engineRevision: 'c'.repeat(40),
          })
        : 'java version "17.0.1"';
    assert.equal(
      collectArtifacts('android', directory, { freeGiB: 0.1, command }),
      true
    );
    for (const [name] of artifacts())
      assert.doesNotMatch(
        readFileSync(resolve(directory, 'artifacts', name), 'utf8'),
        /RAW_SECRET/
      );
    proof.phases.pop();
    writeFileSync(
      resolve(directory, 'native-proof.json'),
      JSON.stringify(proof)
    );
    assert.equal(collectArtifacts('android', directory, { command }), false);
  }));

test('malformed phase entries produce all three sanitized failure artifacts', () =>
  temporary((directory) => {
    for (const phase of [null, 'RAW_SECRET', 7, false, ['RAW_SECRET']]) {
      writeFileSync(
        resolve(directory, 'native-proof.json'),
        JSON.stringify({ passed: true, phases: [phase], raw: 'RAW_SECRET' })
      );
      assert.equal(
        collectArtifacts('android', directory, {
          command: () => {
            throw Error('RAW_SECRET');
          },
        }),
        false
      );
      for (const [name] of artifacts()) {
        const raw = readFileSync(resolve(directory, 'artifacts', name), 'utf8');
        assert.doesNotMatch(raw, /RAW_SECRET/);
        assert.ok(Buffer.byteLength(raw) <= 65_536);
      }
      const proof = JSON.parse(
        readFileSync(resolve(directory, 'artifacts/native-proof.json'))
      );
      assert.equal(proof.passed, false);
      assert.equal(proof.phases[0].passed, false);
      assert.ok(proof.collection_errors.includes('native_proof_malformed'));
    }
  }));
