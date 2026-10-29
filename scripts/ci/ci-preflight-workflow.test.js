const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');
const { readWorkflow } = require('./workflow-yaml-test-helper');
const {
  runWorkflowGate: runAggregate,
} = require('./workflow-gate-test-helper');
const gate = readWorkflow('ci-check.yml');
const expression = (body) => `\${{ ${body} }}`;

test('release relevance is opt-in and shares the exact full-history checkout', () => {
  const call = gate.on.workflow_call;
  assert.deepEqual(call.inputs.check_release_only, {
    required: false,
    type: 'boolean',
    default: false,
    description: 'Also detect whether this push contains only release metadata',
  });
  assert.equal(
    call.outputs.run_checks.value,
    expression('jobs.check.outputs.run_checks')
  );
  assert.equal(
    call.outputs.should_run.value,
    expression('jobs.check.outputs.should_run')
  );
  assert.equal(gate.jobs.check.name, 'Check CI Config');
  assert.deepEqual(Object.keys(gate.jobs), ['check']);
  assert.deepEqual(gate.permissions, { contents: 'read', deployments: 'read' });
  const checkouts = gate.jobs.check.steps.filter((step) =>
    step.uses?.startsWith('actions/checkout@')
  );
  assert.equal(checkouts.length, 1);
  assert.equal(checkouts[0].with.ref, expression('github.sha'));
  assert.equal(checkouts[0].with['fetch-depth'], 0);
  assert.equal(checkouts[0].with['sparse-checkout-cone-mode'], false);
  for (const file of [
    'release-only-changes.js',
    'resolve-changed-files.ts',
    'check-workflow-config.ts',
  ]) {
    assert.ok(
      checkouts[0].with['sparse-checkout'].includes(`scripts/ci/${file}`)
    );
  }
  assert.equal(
    gate.jobs.check.outputs.run_checks,
    expression(
      "steps.pr_release_relevance.outputs.run_checks || steps.release_relevance.outputs.run_checks || 'true'"
    )
  );
  assert.equal(
    gate.jobs.check.outputs.should_run,
    expression('steps.check_config.outputs.should_run')
  );
  const release = gate.jobs.check.steps.find(
    (step) => step.id === 'release_relevance'
  );
  assert.equal(release.if, 'inputs.check_release_only');
  assert.equal(release.shell, 'bash');
  assert.equal(release.env.BEFORE_SHA, expression('github.event.before'));
  assert.match(
    release.run,
    /node scripts\/ci\/release-only-changes\.js "\$BEFORE_SHA" "\$GITHUB_SHA"/
  );
  assert.equal(release['continue-on-error'], undefined);
});

test('shared release step passes through true/false and fails on execution errors', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-preflight-step-'));
  const step = gate.jobs.check.steps.find(
    (entry) => entry.id === 'release_relevance'
  );
  try {
    for (const result of ['true', 'false', 'failure']) {
      const output = path.join(dir, 'output');
      fs.writeFileSync(output, '');
      fs.writeFileSync(
        path.join(dir, 'node'),
        result === 'failure'
          ? '#!/bin/sh\nexit 1\n'
          : `#!/bin/sh\necho ${result}\n`,
        { mode: 0o755 }
      );
      const run = spawnSync(
        'bash',
        ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', step.run],
        {
          cwd: root,
          env: {
            PATH: `${dir}:${process.env.PATH}`,
            BEFORE_SHA: 'before',
            GITHUB_SHA: 'after',
            GITHUB_OUTPUT: output,
          },
          encoding: 'utf8',
        }
      );
      assert.equal(run.status, result === 'failure' ? 1 : 0);
      assert.equal(
        fs.readFileSync(output, 'utf8'),
        result === 'failure' ? '' : `run_checks=${result}\n`
      );
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('real release detector defaults to run for missing and invalid comparisons', () => {
  const script = path.join(root, 'scripts/ci/release-only-changes.js');
  for (const args of [
    [],
    ['', 'HEAD'],
    ['0'.repeat(40), 'HEAD'],
    ['not-a-revision', 'HEAD'],
  ]) {
    const run = spawnSync(process.execPath, [script, ...args], {
      cwd: root,
      encoding: 'utf8',
    });
    assert.equal(run.status, 0);
    assert.equal(run.stdout.trim(), 'true');
  }
});

// Execute each committed gate with GitHub's implicit success dependency rule:
// a status function must override it so a failed proof cannot skip validation.
function evaluateValidationGate(job, needs, isCancelled = false, github = {}) {
  const body = job.if.replace(/^\$\{\{\s*|\s*\}\}$/g, '');
  if (!/\b(?:always|cancelled|failure|success)\(\)/.test(body)) {
    if (
      Object.values(needs).some((dependency) => dependency.result !== 'success')
    )
      return false;
  }
  const source = body.replace(/needs\.([a-z-]+)/g, (_, id) => `needs['${id}']`);
  return Function(
    'needs',
    'cancelled',
    'github',
    `return (${source});`
  )(needs, () => isCancelled, github);
}

for (const [workflowName, jobs] of [['biome-check.yaml', ['format', 'lint']]]) {
  const workflow = readWorkflow(workflowName);
  for (const id of jobs) {
    test(`${workflowName}/${id} runs without a successful explicit duplicate proof`, () => {
      const needs = {
        'check-ci': {
          result: 'success',
          outputs: { should_run: 'true', run_checks: 'true' },
        },
        'test-shards': { result: 'success' },
        'root-script-tests': { result: 'success' },
      };
      for (const [result, output, expected] of [
        ['failure', undefined, true],
        ['failure', 'false', true],
        ['cancelled', undefined, true],
        ['skipped', undefined, true],
        ['success', undefined, true],
        ['success', '', true],
        ['success', 'invalid', true],
        ['success', 'true', true],
        ['success', 'false', false],
      ]) {
        needs['duplicate-validation'] = {
          result,
          outputs: { run_checks: output ?? '' },
        };
        assert.equal(
          evaluateValidationGate(workflow.jobs[id], needs),
          workflowName === 'turbo-unit-tests.yaml' && id === 'build'
            ? true
            : expected,
          `${result}/${output ?? 'absent'}`
        );
      }
      needs['duplicate-validation'] = { result: 'failure', outputs: {} };
      assert.equal(
        evaluateValidationGate(workflow.jobs[id], needs, true),
        false
      );
      needs['check-ci'].outputs.should_run = 'false';
      assert.equal(evaluateValidationGate(workflow.jobs[id], needs), false);
      needs['check-ci'].outputs.should_run = 'true';
      needs['check-ci'].result = 'failure';
      assert.equal(evaluateValidationGate(workflow.jobs[id], needs), false);
      needs['check-ci'].result = 'success';
      needs['check-ci'].outputs.run_checks = 'false';
      assert.equal(
        evaluateValidationGate(workflow.jobs[id], needs),
        workflowName === 'biome-check.yaml'
      );
      if (id === 'test' || id === 'build') {
        needs['check-ci'].outputs.run_checks = 'true';
        needs['test-shards'].result = 'failure';
        assert.equal(evaluateValidationGate(workflow.jobs[id], needs), true);
        const result = runAggregate(workflow.jobs[id], {
          TEST_RESULT: 'failure',
          ROOT_SCRIPT_RESULT: 'success',
          DUPLICATE_RESULT: 'failure',
          DUPLICATE_RUN_CHECKS: '',
        });
        assert.notEqual(result.status, 0);
      }
    });
  }
}

test('unit aggregate requires fresh root and shard success despite legacy receipts', () => {
  const job = readWorkflow('turbo-unit-tests.yaml').jobs.build;
  const needs = {
    'check-ci': {
      result: 'success',
      outputs: { should_run: 'true', run_checks: 'true' },
    },
    'duplicate-validation': {
      result: 'success',
      outputs: { run_checks: 'false' },
    },
    'test-shards': { result: 'skipped' },
    'root-script-tests': { result: 'failure' },
  };
  assert.equal(evaluateValidationGate(job, needs), true);

  for (const [duplicate, runChecks, shards, rootResult, pass] of [
    ['success', 'false', 'skipped', 'success', false],
    ['success', 'false', 'skipped', 'failure', false],
    ['success', 'false', 'skipped', 'cancelled', false],
    ['success', 'false', 'skipped', 'skipped', false],
    ['success', 'false', 'skipped', '', false],
    ['failure', 'false', 'skipped', 'success', false],
    ['skipped', '', 'skipped', 'success', false],
    ['success', 'true', 'skipped', 'success', false],
    ['success', '', 'skipped', 'success', false],
    ['success', 'invalid', 'skipped', 'success', false],
    ['failure', 'false', 'success', 'success', true],
    ['skipped', '', 'success', 'success', true],
    ['success', 'true', 'success', 'success', true],
    ['skipped', '', 'failure', 'success', false],
    ['skipped', '', 'cancelled', 'success', false],
    ['skipped', '', 'success', 'failure', false],
  ]) {
    const result = runAggregate(job, {
      CHANGES_RESULT: 'success',
      CODE: 'true',
      DUPLICATE_RESULT: duplicate,
      DUPLICATE_RUN_CHECKS: runChecks,
      TEST_RESULT: shards,
      ROOT_SCRIPT_RESULT: rootResult,
      RUST_QUALIFICATION_REQUIRED: 'false',
    });
    assert.equal(
      result.status === 0,
      pass,
      `${duplicate}/${runChecks}/${shards}/${rootResult}`
    );
  }
});

test('Rust source qualification is bounded and restricted to the reviewed integration refs', () => {
  const job = readWorkflow('turbo-unit-tests.yaml').jobs[
    'backend-source-qualification'
  ];
  assert.deepEqual(job.needs, ['check-ci']);
  assert.deepEqual(job.permissions, { contents: 'read' });
  assert.equal(job['timeout-minutes'], 45);
  assert.equal(job.env.CARGO_BUILD_JOBS, '2');
  assert.equal(job.defaults.run['working-directory'], './apps/backend');
  const toolchain = job.steps.find((step) => step.with?.toolchain);
  assert.equal(
    toolchain.uses,
    'dtolnay/rust-toolchain@6bed0761d98439e5a578e2877258200ad565ba87'
  );
  assert.equal(toolchain.with.toolchain, '1.95.0');
  assert.equal(toolchain.with.components, 'clippy, rustfmt');
  assert.equal(toolchain.with.targets, 'wasm32-unknown-unknown');
  const checkout = job.steps.find((step) =>
    step.uses?.startsWith('actions/checkout@')
  );
  assert.equal(checkout.with.ref, expression('github.sha'));
  assert.equal(checkout.with['persist-credentials'], false);
  const commands = job.steps.map((step) => step.run).filter(Boolean);
  for (const command of [
    'cargo fmt --check',
    'cargo clippy --locked --all-targets --features native -- -D warnings',
    'cargo test --locked --lib -- --test-threads=2',
    'cargo check --locked --target wasm32-unknown-unknown --no-default-features --features worker',
  ])
    assert.ok(commands.includes(command), command);
  assert.ok(!JSON.stringify(job).includes('secrets.'));
  for (const [ref, shouldRun, runChecks, result, expected] of [
    ['fix/release-5795-reconciliation', 'true', 'true', 'success', true],
    [
      'fix/main-production-reconciliation-20261012',
      'true',
      'true',
      'success',
      true,
    ],
    [
      'fix/main-production-reconciliation-20261012',
      'false',
      'true',
      'success',
      false,
    ],
    [
      'fix/main-production-reconciliation-20261012',
      'true',
      'false',
      'success',
      false,
    ],
    [
      'fix/main-production-reconciliation-20261012',
      'true',
      'true',
      'failure',
      false,
    ],
    ['main', 'true', 'true', 'success', false],
    ['production', 'true', 'true', 'success', false],
    ['fix/another-release', 'true', 'true', 'success', false],
    ['fix/release-5795-reconciliation', 'false', 'true', 'success', false],
    ['fix/release-5795-reconciliation', 'true', 'false', 'success', false],
    ['fix/release-5795-reconciliation', 'true', 'true', 'failure', false],
  ]) {
    const needs = {
      'check-ci': {
        result,
        outputs: { should_run: shouldRun, run_checks: runChecks },
      },
    };
    assert.equal(
      evaluateValidationGate(job, needs, false, { ref: `refs/heads/${ref}` }),
      expected
    );
  }
});

test('release aggregate requires fresh Rust success despite legacy receipts', () => {
  const job = readWorkflow('turbo-unit-tests.yaml').jobs.build;

  assert.equal(
    job.steps.find((step) => step.env?.RUST_RESULT).env.RUST_RESULT,
    expression('needs.backend-source-qualification.result')
  );
  assert.equal(
    job.steps.find((step) => step.env?.RUST_QUALIFICATION_REQUIRED).env
      .RUST_QUALIFICATION_REQUIRED,
    expression(
      "(github.ref == 'refs/heads/fix/release-5795-reconciliation' || github.ref == 'refs/heads/fix/main-production-reconciliation-20261012')"
    )
  );
  for (const reuse of [true, false]) {
    for (const rust of ['success', 'failure', 'cancelled', 'skipped', '']) {
      const needs = {
        'check-ci': {
          result: 'success',
          outputs: { should_run: 'true', run_checks: 'true' },
        },
        'duplicate-validation': {
          result: reuse ? 'success' : 'skipped',
          outputs: { run_checks: reuse ? 'false' : '' },
        },
        'test-shards': { result: 'success' },
        'root-script-tests': { result: 'success' },
        'backend-source-qualification': { result: rust },
      };
      assert.equal(evaluateValidationGate(job, needs), true);
      const env = {
        CHANGES_RESULT: 'success',
        CODE: 'true',
        DUPLICATE_RESULT: needs['duplicate-validation'].result,
        DUPLICATE_RUN_CHECKS: needs['duplicate-validation'].outputs.run_checks,
        TEST_RESULT: needs['test-shards'].result,
        ROOT_SCRIPT_RESULT: 'success',
        RUST_QUALIFICATION_REQUIRED: 'true',
        RUST_RESULT: rust,
      };
      assert.equal(
        runAggregate(job, env).status === 0,
        rust === 'success',
        `${reuse}/${rust}`
      );
      assert.notEqual(
        runAggregate(job, { ...env, ROOT_SCRIPT_RESULT: 'failure' }).status,
        0
      );
      assert.equal(
        runAggregate(job, { ...env, RUST_QUALIFICATION_REQUIRED: 'false' })
          .status,
        0
      );
    }
  }
});
