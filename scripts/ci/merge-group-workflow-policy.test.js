// Merge queue (merge_group) policy. A merge group runs untrusted candidate code
// (queued pull requests, possibly from forks) in the base repository, where
// secrets would otherwise be available. Only the selected required-check
// workflows below run for it, and each run must look like an untrusted pull
// request: no secrets, read-only permissions, GitHub-hosted runners and gate
// scripts loaded from the queue base B.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const {
  readAllWorkflows,
  workflowsDir,
} = require('./workflow-yaml-test-helper');

const TARGETS = [
  'app-builds-affected.yaml',
  'codeql.yml',
  'security-checks.yaml',
  'turbo-unit-tests.yaml',
  'type-check.yaml',
];
// Pre-existing merge_group workflow (not part of the selected set); listed by
// exact path so no other workflow can gain the trigger unnoticed.
const PREEXISTING = ['required-account-mfa-contract.yaml'];
// Reusable workflows a target may call on merge_group, by exact path.
const REUSABLE = ['ci-check.yml', 'ci-plan.yaml', 'codecov.yaml', 'codeql.yml'];
// The only write scope a merge group may hold: CodeQL uploading its results.
const CODEQL_WRITERS = ['codeql.yml:analyze', 'security-checks.yaml:codeql'];

const workflows = readAllWorkflows(workflowsDir, { raw: true });
const text = (file) => fs.readFileSync(path.join(workflowsDir, file), 'utf8');
const triggers = (workflow) =>
  typeof workflow.on === 'string'
    ? { [workflow.on]: null }
    : Array.isArray(workflow.on)
      ? Object.fromEntries(workflow.on.map((name) => [name, null]))
      : (workflow.on ?? {});

// Raw text of one top-level job, comments and every expression included.
function rawJob(file, id) {
  const lines = text(file).split('\n');
  const start = lines.indexOf(`  ${id}:`);
  assert.notEqual(start, -1, `${file}:${id}`);
  let end = lines.findIndex(
    (line, index) => index > start && /^ {2}[\w-]+:\s*$/.test(line)
  );
  if (end === -1) end = lines.length;
  return lines.slice(start, end).join('\n');
}

const mergeGroup = {
  event_name: 'merge_group',
  repository: 'tutur3u/platform',
  ref: 'refs/heads/gh-readonly-queue/main/pr-1-0123456789abcdef0123456789abcdef01234567',
  actor: 'maintainer',
  triggering_actor: 'maintainer',
  run_attempt: 1,
  event: {
    merge_group: {
      base_sha: 'a'.repeat(40),
      head_sha: 'b'.repeat(40),
    },
  },
};

// GitHub expressions used here are valid JavaScript once unwrapped.
function evaluate(expression, { inputs = {}, vars = {} } = {}) {
  if (typeof expression !== 'string' || !expression.includes('${{'))
    return expression;
  return vm.runInNewContext(
    expression.trim().replace(/^\$\{\{\s*|\s*\}\}$/g, ''),
    {
      github: mergeGroup,
      inputs,
      vars,
      fromJSON: JSON.parse,
      contains: (list, value) => (list ?? []).includes(value),
      startsWith: (value, prefix) => String(value).startsWith(prefix),
      format: (template, ...args) =>
        template.replace(/\{(\d+)\}/g, (_, index) => String(args[index])),
    }
  );
}

test('exactly the selected workflows run for merge queue checks', () => {
  const actual = Object.entries(workflows)
    .filter(([, workflow]) => 'merge_group' in triggers(workflow))
    .map(([file]) => file)
    .sort();
  assert.deepEqual(actual, [...TARGETS, ...PREEXISTING].sort());
  for (const file of TARGETS)
    assert.deepEqual(triggers(workflows[file]).merge_group, {
      types: ['checks_requested'],
    });
});

test('no pull_request_target workflow, such as the classifier, gains merge_group', () => {
  const targets = Object.entries(workflows).filter(
    ([, workflow]) => 'pull_request_target' in triggers(workflow)
  );
  assert.ok(
    targets.some(([file]) => file === 'security-review-classifier.yaml'),
    'expected the security review classifier to stay pull_request_target'
  );
  for (const [file, workflow] of targets)
    assert.equal('merge_group' in triggers(workflow), false, file);
});

test('no workflow_run consumer can be chained from a merge group run', () => {
  const names = new Set(
    [...TARGETS, ...PREEXISTING].map((file) => workflows[file].name)
  );
  for (const [file, workflow] of Object.entries(workflows)) {
    const listened = triggers(workflow).workflow_run?.workflows ?? [];
    for (const name of listened)
      assert.equal(names.has(name), false, `${file} listens to ${name}`);
  }
});

test('merge group jobs stay on GitHub-hosted runners with read-only tokens', () => {
  const writers = [];
  for (const file of new Set([...TARGETS, ...REUSABLE])) {
    const workflow = workflows[file];
    for (const level of Object.values(workflow.permissions ?? {}))
      assert.match(level, /^(read|none)$/, `${file} workflow permissions`);
    for (const [id, job] of Object.entries(workflow.jobs)) {
      const where = `${file}:${id}`;
      for (const [scope, level] of Object.entries(job.permissions ?? {})) {
        if (level === 'write') {
          assert.equal(scope, 'security-events', where);
          writers.push(where);
        } else assert.match(level, /^(read|none)$/, `${where} ${scope}`);
      }
      if (job.uses) {
        const callee = job.uses.replace('./.github/workflows/', '');
        assert.ok(REUSABLE.includes(callee), `${where} calls ${job.uses}`);
        // ci-check.yml selects the self-hosted PR pool only through this input.
        assert.equal(
          Boolean(evaluate(job.with?.pr_runner ?? false)),
          false,
          `${where} pr_runner`
        );
        continue;
      }
      for (const value of ['true', 'pr:1', ''])
        assert.equal(
          evaluate(job['runs-on'], {
            inputs: { pr_runner: false },
            vars: { PR_SELF_HOSTED_RUNNERS: value },
          }),
          'ubuntu-latest',
          `${where} runs-on`
        );
    }
  }
  assert.deepEqual(writers.sort(), CODEQL_WRITERS);
});

test('no job that can run for a merge group names a secret', () => {
  // GitHub ships every secret a job names to its runner, even behind a guard
  // that evaluates to '', and a merge group runs candidate code there.
  const excludes = /github\.event_name != 'merge_group'/;
  for (const file of TARGETS) {
    for (const [id, job] of Object.entries(workflows[file].jobs)) {
      const raw = rawJob(file, id);
      if (!raw.includes('secrets.')) continue;
      if (job.uses) {
        // A reusable call has no runner of its own: every secret it maps must
        // be push-only, so the callee receives '' on merge_group.
        for (const value of Object.values(job.secrets ?? {}))
          assert.equal(evaluate(value), '', `${file}:${id} maps a secret`);
        assert.doesNotMatch(
          raw.replace(/^ {4}secrets:\n(?: {6}.*\n?)*/m, ''),
          /secrets\./,
          `${file}:${id}`
        );
        continue;
      }
      assert.match(job.if, excludes, `${file}:${id} must skip merge groups`);
    }
  }
});

test('every secret expression excludes merge groups explicitly or is push-only', () => {
  for (const file of TARGETS) {
    for (const [, expression] of text(file).matchAll(/\$\{\{(.*?)\}\}/g)) {
      if (!expression.includes('secrets.')) continue;
      assert.match(
        expression,
        /github\.event_name != 'merge_group'|^\s*github\.event_name == 'push' &&/,
        `${file}: ${expression.trim()}`
      );
      assert.equal(evaluate(`\${{${expression}}}`), '', expression.trim());
    }
  }
});

test('exactly the secret-free pull request variant runs for a merge group', () => {
  for (const [file, hosted, routed] of [
    ['turbo-unit-tests.yaml', 'test-shards', 'test-shards-pr'],
    ['type-check.yaml', 'type-check', 'type-check-pr'],
  ]) {
    const { jobs } = workflows[file];
    assert.match(jobs[hosted].if, /github\.event_name != 'merge_group'/);
    assert.match(
      jobs[routed].if,
      /\(github\.event_name == 'pull_request' \|\| github\.event_name == 'merge_group'\)/
    );
    assert.doesNotMatch(rawJob(file, routed), /secrets\./);
  }
});

test('merge group runs never cancel each other', () => {
  for (const file of TARGETS)
    assert.equal(
      evaluate(workflows[file].concurrency['cancel-in-progress']),
      false,
      file
    );
});

test('merge group ranges come from the queue payload and gates from base B', () => {
  for (const file of TARGETS) {
    const source = text(file);
    // Every pull request base input also accepts the queue base.
    for (const [line] of source.matchAll(
      /.*github\.event\.pull_request\.base\.sha.*/g
    ))
      assert.match(
        line,
        /github\.event\.merge_group\.base_sha/,
        `${file}: ${line.trim()}`
      );
    // Every pull request/push event switch also handles merge groups.
    for (const [line] of source.matchAll(
      /.*"\$EVENT_NAME" = pull_request \] \|\| \[ "\$EVENT_NAME" = push \].*/g
    ))
      assert.match(
        line,
        /"\$EVENT_NAME" = merge_group/,
        `${file}: ${line.trim()}`
      );
    for (const [line] of source.matchAll(
      /.*github\.event_name == 'pull_request' \|\| github\.event_name == 'push'.*/g
    ))
      assert.match(
        line,
        /github\.event_name == 'merge_group'/,
        `${file}: ${line.trim()}`
      );
  }

  const codeql = workflows['codeql.yml'].jobs.analyze.steps.find(
    (step) => step.name === 'Fail on new high or critical results'
  );
  assert.match(codeql.if, /github\.event_name == 'merge_group'/);
  assert.equal(
    codeql.env.QUEUE_BASE_SHA,
    '${{ github.event.merge_group.base_sha }}'
  );
  assert.match(codeql.run, /trusted="\$QUEUE_BASE_SHA"/);
  assert.match(
    codeql.run,
    /git show "\$trusted:scripts\/ci\/codeql-new-alerts\.js"/
  );

  const guard = workflows['security-checks.yaml'].jobs['definer-guard'];
  assert.match(guard.if, /github\.event_name == 'merge_group'/);

  // A missing queue base fails closed wherever the fallback would trust M:
  // a merge_group branch must reach the error and exit 1 within three lines.
  for (const [file, message] of [
    ['codeql.yml', 'refusing to gate'],
    ['security-checks.yaml', 'refusing to load the definer guard'],
    ['security-checks.yaml', 'refusing to scan with untrusted config'],
    ['security-checks.yaml', 'refusing to audit'],
    ['app-builds-affected.yaml', 'refusing to select affected apps'],
  ])
    assert.match(
      text(file),
      new RegExp(
        `"\\$EVENT_NAME" = merge_group \\][^\\n]*\\n(?:[^\\n]*\\n){0,2}?\\s*echo "::error::[^"\\n]*${message}[^\\n]*\\n\\s*exit 1\\n`
      ),
      `${file}: ${message}`
    );

  assert.equal(
    workflows['type-check.yaml'].jobs['type-check'].steps.find(
      (step) => step.id === 'release_relevance'
    ).env.BEFORE_SHA,
    '${{ github.event.before || github.event.merge_group.base_sha }}'
  );
});
