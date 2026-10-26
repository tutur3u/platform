const assert = require('node:assert/strict');
const { spawnSync, execFileSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');
const { readAllWorkflows } = require('./workflow-yaml-test-helper');
const {
  evaluateExpression,
  renderTemplate,
} = require('./github-expression-test-helper');
const workflows = readAllWorkflows(undefined, { raw: true });
const workflow = workflows['pr-checks.yaml'];
const filters = JSON.parse(
  execFileSync(
    'bun',
    [
      '-e',
      'console.log(JSON.stringify(Bun.YAML.parse(process.argv[1])))',
      workflow.jobs.scope.steps[0].with.filters,
    ],
    { encoding: 'utf8' }
  )
);
const converted = [
  'biome-check.yaml',
  'i18n-check.yaml',
  'docs-seo-check.yaml',
  'check-migrations.yml',
  'check-migration-timestamps.yml',
  'mobile-api-mappings.yaml',
  'ci-admitted.yaml',
];

test('one unfiltered PR entrypoint replaces seven independent PR runs', () => {
  assert.deepEqual(Object.keys(workflow.on), ['pull_request']);
  assert.deepEqual(Object.keys(workflow.on.pull_request), ['types']);
  for (const file of converted) {
    assert.equal(workflows[file].on.pull_request, undefined, file);
    assert.ok(Object.hasOwn(workflows[file].on, 'workflow_call'), file);
  }
  for (const file of ['branch-name-check.yaml', 'codex-plugin.yaml']) {
    const push = workflows[file].on.push;
    assert.ok(
      !push ||
        push.branches.every((branch) =>
          ['main', 'production', 'release-please--branches--**'].includes(
            branch
          )
        ),
      file
    );
  }
});

test('existing check display names remain stable in the consolidated run', () => {
  const expected = {
    'biome-check.yaml': {
      format: 'Biome Format Check',
      lint: 'Biome Lint Check',
    },
    'i18n-check.yaml': {
      'i18n-sort-check': 'Translation Sort Check',
      'i18n-translation-check': 'Translation Keys Check',
      'i18n-key-parity-check': 'Key Parity Check (en ↔ vi)',
      'i18n-namespace-check': 'Namespace Check (shared → apps)',
    },
    'ci-admitted.yaml': { admitted: 'CI admitted (ready-for-ci)' },
    'codex-plugin.yaml': { validate: 'Validate Tuturuuu Codex Plugin' },
  };
  for (const [file, jobs] of Object.entries(expected)) {
    for (const [id, name] of Object.entries(jobs))
      assert.equal(workflows[file].jobs[id].name, name);
  }
  assert.equal(workflow.jobs['branch-name'].name, 'Check branch name');
  assert.equal(workflow.jobs.gate.name, 'Cheap PR Checks');
  assert.equal(workflow.jobs.gate.if, '!cancelled()');
});

const resultSet = (overrides = {}, selected = {}) =>
  Object.fromEntries(
    Object.keys(workflow.jobs)
      .filter((id) => id !== 'gate')
      .map((id) => [
        id,
        {
          result:
            overrides[id] ||
            (['scope', 'branch-name', 'admitted'].includes(id)
              ? 'success'
              : 'skipped'),
          outputs:
            id === 'scope'
              ? Object.fromEntries(
                  Object.keys(filters).map((name) => [
                    name,
                    String(selected[name] || false),
                  ])
                )
              : {},
        },
      ])
  );
function gate(results, ready = false) {
  const script = workflow.jobs.gate.steps[0].run
    .replace("node - <<'NODE'\n", '')
    .replace(/\nNODE\s*$/u, '');
  return spawnSync(process.execPath, ['-e', script], {
    encoding: 'utf8',
    env: {
      ...process.env,
      RESULTS: JSON.stringify(results),
      READY: String(ready),
      FULL_RUN: 'true',
      BASE_BRANCH: 'main',
    },
  });
}

test('the always-run gate accepts path skips and rejects failures, cancellation and selected skips', () => {
  assert.equal(gate(resultSet()).status, 0);
  assert.equal(gate(resultSet({}, {}), true).status, 0);
  for (const status of ['failure', 'cancelled', 'skipped']) {
    assert.equal(
      gate(resultSet({ scope: status })).status,
      1,
      `scope ${status}`
    );
    assert.equal(
      gate(resultSet({ admitted: status })).status,
      1,
      `admitted ${status}`
    );
    assert.equal(
      gate(resultSet({ biome: status }, { biome: true }), true).status,
      1,
      `selected biome ${status}`
    );
  }
  assert.equal(
    gate(resultSet({ biome: 'success' }, { biome: true }), true).status,
    0
  );
  assert.equal(gate(resultSet({ migrations: 'failure' }, {})).status, 1);
});

test('gated callers stay deferred until ready while script-only checks remain eligible', () => {
  const scope = (ready) => ({
    github: {
      base_ref: 'main',
      event: {
        pull_request: { labels: ready ? [{ name: 'ready-for-ci' }] : [] },
      },
    },
    needs: {
      scope: {
        outputs: Object.fromEntries(
          Object.keys(filters).map((key) => [key, 'true'])
        ),
      },
    },
  });
  for (const name of ['biome', 'i18n', 'docs']) {
    assert.equal(
      Boolean(evaluateExpression(workflow.jobs[name].if, scope(false))),
      false,
      name
    );
    assert.equal(
      Boolean(evaluateExpression(workflow.jobs[name].if, scope(true))),
      true,
      name
    );
  }
  for (const name of ['migration-timestamps', 'migrations', 'mobile', 'plugin'])
    assert.equal(
      Boolean(evaluateExpression(workflow.jobs[name].if, scope(false))),
      true,
      name
    );
  assert.equal(workflow.jobs.admitted.if, undefined);
});

test('security scope remains always on for every security-relevant path without readiness', () => {
  const security = workflows['security-checks.yaml'];
  assert.equal(security.on.pull_request, null);
  assert.equal(security.jobs.scope.if, undefined);
  assert.equal(security.jobs.scope.needs, undefined);
  assert.ok(!JSON.stringify(security).includes('ready-for-ci'));
  for (const file of [
    '.github/workflows/pr-checks.yaml',
    'packages/auth/src/session.ts',
    'supabase/migrations/change.sql',
    'apps/database/supabase/migrations/change.sql',
    'apps/web/src/app/api/auth/route.ts',
    'apps/pay/src/app/api/payment/route.ts',
    'scripts/ci/pr-checks.test.js',
  ]) {
    // No workflow-level path filter or gate can remove any of these events.
    assert.equal(Object.keys(security.on.pull_request || {}).length, 0, file);
  }
  const checkouts = security.jobs.scope.steps.filter((step) =>
    step.uses?.startsWith('actions/checkout@')
  );
  assert.ok(
    checkouts.some((step) => JSON.stringify(step).includes('sparse-checkout'))
  );
});

test('all new third-party actions are immutable and callees cannot cancel their parent', () => {
  assert.match(
    workflow.jobs.scope.steps[0].uses,
    /^dorny\/paths-filter@[a-f0-9]{40}$/u
  );
  const context = {
    github: {
      workflow: workflow.name,
      event_name: 'pull_request',
      ref: 'refs/pull/42/merge',
      run_attempt: 1,
      event: {
        pull_request: { number: 42, labels: [{ name: 'ready-for-ci' }] },
      },
    },
  };
  const parent = renderTemplate(workflow.concurrency.group, context);
  const groups = [
    'i18n-check.yaml',
    'docs-seo-check.yaml',
    'check-migrations.yml',
    'check-migration-timestamps.yml',
    'mobile-api-mappings.yaml',
    'codex-plugin.yaml',
    'ci-admitted.yaml',
  ].map((file) => renderTemplate(workflows[file].concurrency.group, context));
  assert.equal(new Set([parent, ...groups]).size, groups.length + 1);
  assert.ok(!Object.hasOwn(workflows['biome-check.yaml'], 'concurrency'));
});

test('the inventory records all baseline PR entrypoints and the required-check mapping', () => {
  const fs = require('node:fs');
  const inventory = fs.readFileSync(
    path.resolve(__dirname, '../../.github/pr-ci-inventory.md'),
    'utf8'
  );
  assert.equal((inventory.match(/<code>pull_request:/gu) || []).length, 65);
  for (const file of converted)
    assert.ok(inventory.includes(`\`${file}\``), file);
  assert.match(
    inventory,
    /Required status checks are empty in all four repository rulesets/u
  );
  assert.match(
    inventory,
    /legacy main-branch required-status endpoint returned 404/u
  );
});

test('the consolidated branch check executes the existing policy with branch names as data', () => {
  const script = workflow.jobs['branch-name'].steps[0].run;
  const { BRANCH_NAME_PATTERN } = require('../check-changed/plan');
  const match = /\[\[ \$BRANCH_NAME =~ (.+) \]\]/u.exec(script);
  assert.equal(BRANCH_NAME_PATTERN.source, match[1].replaceAll('/', '\\/'));
  for (const branch of [
    'fix/ci-throughput',
    'docs/review-rules',
    'release-please--branches--production',
    'imgbot',
    'ci/unapproved',
    'main',
  ]) {
    const result = spawnSync('bash', ['-c', script], {
      encoding: 'utf8',
      env: { ...process.env, PR_BRANCH: branch },
    });
    assert.equal(
      result.status,
      BRANCH_NAME_PATTERN.test(branch) ? 0 : 1,
      branch
    );
  }
});

test('Security Checks bytes match the pinned PR base 30a396356e534edafac76ef917d6a55cb26d1d8e', () => {
  const { createHash } = require('node:crypto');
  const { readFileSync } = require('node:fs');
  const bytes = readFileSync(
    path.resolve(__dirname, '../../.github/workflows/security-checks.yaml')
  );
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    'e40cc4481e16dba35251cbe90be820e8368639a230cdcb521e654fa8a34e6234'
  );
});
