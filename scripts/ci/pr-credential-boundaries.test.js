const assert = require('node:assert/strict');
const test = require('node:test');
const { readAllWorkflows } = require('./workflow-yaml-test-helper');
const {
  evaluateExpression,
  renderTemplate,
} = require('./github-expression-test-helper');
const workflows = readAllWorkflows();
const unit = workflows['turbo-unit-tests.yaml'];
const coverage = workflows['codecov.yaml'];
const discord = workflows['discord-python-ci.yml'];
const credentials = {
  PROXY_API_KEY: 'synthetic-private-proxy',
  NEXT_PUBLIC_PROXY_API_KEY: 'synthetic-client-proxy',
  CODECOV_TOKEN: 'synthetic-coverage-token',
};
const ready = {
  result: 'success',
  outputs: { should_run: 'true', run_checks: 'true' },
};
const cases = [
  {
    name: 'same-repo PR',
    event: 'pull_request',
    ref: 'refs/pull/12/merge',
    allowed: false,
  },
  {
    name: 'fork PR',
    event: 'pull_request',
    ref: 'refs/pull/12/merge',
    fork: true,
    allowed: false,
  },
  {
    name: 'PR with main ref',
    event: 'pull_request',
    ref: 'refs/heads/main',
    allowed: false,
  },
  {
    name: 'PR with production ref',
    event: 'pull_request',
    ref: 'refs/heads/production',
    allowed: false,
  },
  {
    name: 'PR target',
    event: 'pull_request_target',
    ref: 'refs/heads/main',
    allowed: false,
  },
  {
    name: 'unqualified workflow-run caller',
    event: 'workflow_run',
    ref: 'refs/heads/main',
    allowed: false,
  },
  {
    name: 'unknown reusable caller',
    event: 'workflow_call',
    ref: 'refs/heads/main',
    allowed: false,
  },
  {
    name: 'feature push',
    event: 'push',
    ref: 'refs/heads/feature/test',
    allowed: false,
  },
  { name: 'main push', event: 'push', ref: 'refs/heads/main', allowed: true },
  {
    name: 'production push',
    event: 'push',
    ref: 'refs/heads/production',
    allowed: true,
  },
  {
    name: 'generated release push',
    event: 'push',
    ref: 'refs/heads/release-please--branches--main',
    allowed: true,
  },
];
function scope(row) {
  return {
    github: {
      event_name: row.event,
      ref: row.ref,
      actor: 'trusted-maintainer',
      repository: 'tutur3u/platform',
      event: {
        pull_request: {
          draft: false,
          labels: [{ name: 'ready-for-ci' }],
          label_names: ['ready-for-ci'],
          head: {
            repo: {
              full_name: row.fork ? 'contributor/platform' : 'tutur3u/platform',
            },
          },
        },
      },
    },
    needs: {
      'check-ci': ready,
      'coverage-check-ci': ready,
      'test-shards':
        row.event === 'pull_request' ? { result: 'skipped' } : ready,
      'test-shards-pr':
        row.event === 'pull_request' ? ready : { result: 'skipped' },
    },
    secrets: credentials,
    vars: {},
  };
}
function admitted(job, context) {
  if (!job.if) return true;
  return Boolean(
    evaluateExpression(
      job.if.replaceAll(
        'github.event.pull_request.labels.*.name',
        'github.event.pull_request.label_names'
      ),
      context
    )
  );
}
function credential(value, context) {
  return renderTemplate(value ?? '', context);
}
const calleeUpload = coverage.jobs.test.steps.find((s) =>
  s.uses?.startsWith('codecov/codecov-action@')
);
const discordUpload = discord.jobs['test-coverage'].steps.find((s) =>
  s.uses?.startsWith('codecov/codecov-action@')
);
const callers = Object.entries(workflows).flatMap(([file, workflow]) =>
  Object.entries(workflow.jobs).flatMap(([jobId, job]) =>
    job.uses === './.github/workflows/codecov.yaml'
      ? [{ file, jobId, job }]
      : []
  )
);
for (const row of cases) {
  test('credential event/caller matrix: ' + row.name, () => {
    const context = scope(row);
    for (const name of ['PROXY_API_KEY', 'NEXT_PUBLIC_PROXY_API_KEY']) {
      assert.equal(
        credential(unit.jobs['test-shards'].env[name], context),
        row.allowed ? credentials[name] : '',
        'unit shard: ' + name
      );
    }
    assert.equal(
      credential(discordUpload.env?.CODECOV_TOKEN, context),
      row.allowed ? credentials.CODECOV_TOKEN : '',
      'Discord upload'
    );
    assert.equal(
      credential(calleeUpload.with.token, context),
      row.allowed ? credentials.CODECOV_TOKEN : '',
      'reusable callee with a hostile forwarded token'
    );
    for (const { file, jobId, job } of callers) {
      assert.notEqual(
        job.secrets,
        'inherit',
        file + ':' + jobId + ' must map credentials explicitly'
      );
      assert.equal(
        credential(job.secrets?.CODECOV_TOKEN, context),
        row.allowed ? credentials.CODECOV_TOKEN : '',
        file + ':' + jobId
      );
      const forwarded = credential(job.secrets?.CODECOV_TOKEN, context);
      assert.equal(
        credential(calleeUpload.with.token, {
          ...context,
          secrets: { CODECOV_TOKEN: forwarded },
        }),
        row.allowed ? credentials.CODECOV_TOKEN : '',
        'caller -> callee'
      );
    }
  });
}
test('same-repo and fork PRs retain secret-free test and coverage execution', () => {
  for (const row of cases.filter((c) => c.event === 'pull_request')) {
    const context = scope(row);
    for (const job of [
      unit.jobs['test-shards-pr'],
      unit.jobs['coverage-upload'],
      discord.jobs['test-coverage'],
    ]) {
      assert.equal(
        admitted(job, context),
        true,
        'admitted PR coverage must not be skipped'
      );
    }
  }
  const commands = unit.jobs['test-shards-pr'].steps.map(
    (s) => s.with?.command || s.run || ''
  );
  assert.ok(commands.some((c) => /run-test-shard\.js .* --coverage/.test(c)));
  assert.ok(
    discord.jobs['test-coverage'].steps.some((s) =>
      /pytest --cov=/.test(s.run || '')
    )
  );
  assert.equal(
    unit.jobs['test-shards-pr'].env.SUPABASE_SECRET_KEY,
    'sb_secret_ci_placeholder'
  );
  assert.doesNotMatch(JSON.stringify(unit.jobs['test-shards-pr']), /secrets\./);
  for (const row of cases.filter((c) => c.event === 'pull_request'))
    assert.equal(admitted(unit.jobs['test-shards'], scope(row)), false);
  const artifact = unit.jobs['test-shards-pr'].steps.find((s) =>
    s.uses?.startsWith('actions/upload-artifact@')
  );
  assert.equal(artifact.with['if-no-files-found'], 'error');
});
test('credential removal does not admit self-hosted runners or increase token permissions', () => {
  for (const job of [
    unit.jobs['test-shards'],
    coverage.jobs.test,
    discord.jobs['test-coverage'],
  ]) {
    assert.equal(job['runs-on'], 'ubuntu-latest');
  }
  for (const workflow of [unit, coverage, discord])
    assert.deepEqual(workflow.permissions, { contents: 'read' });
  assert.ok(callers.length > 0, 'exercise every current local reusable caller');
});
test('matrix has a positive control for the former unconditional same-repo PR expression', () => {
  const context = scope(cases[0]);
  assert.equal(
    credential('$' + '{{ secrets.PROXY_API_KEY }}', context),
    credentials.PROXY_API_KEY
  );
  assert.equal(
    context.github.event.pull_request.head.repo.full_name,
    context.github.repository
  );
});
