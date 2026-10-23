const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { readWorkflow } = require('./workflow-yaml-test-helper');

const workflowsDir = path.resolve(__dirname, '../../.github/workflows');
const source = (file) => fs.readFileSync(path.join(workflowsDir, file), 'utf8');
const expression = (body) => `\${{ ${body} }}`;
const triggers = (workflow) => workflow.on ?? workflow.true;

const classifier = readWorkflow('security-review-classifier.yaml');
const codeql = readWorkflow('codeql.yml');
const checks = readWorkflow('security-checks.yaml');

test('security review classifier never touches pull request content', () => {
  assert.deepEqual(Object.keys(triggers(classifier)), ['pull_request_target']);
  for (const type of ['opened', 'synchronize', 'edited', 'unlabeled']) {
    assert.ok(triggers(classifier).pull_request_target.types.includes(type));
  }
  assert.deepEqual(classifier.permissions, { contents: 'read' });
  assert.deepEqual(Object.keys(classifier.jobs), ['classify']);
  const job = classifier.jobs.classify;
  assert.deepEqual(job.permissions, {
    checks: 'write',
    contents: 'read',
    issues: 'write',
    'pull-requests': 'write',
  });
  const [checkout, setupNode, classify, ...rest] = job.steps;
  assert.deepEqual(rest, []);
  assert.match(checkout.uses, /^actions\/checkout@[0-9a-f]{40}$/u);
  assert.equal(
    checkout.with.ref,
    expression('github.event.repository.default_branch')
  );
  assert.equal(checkout.with['persist-credentials'], false);
  assert.deepEqual(checkout.with['sparse-checkout'].trim().split('\n'), [
    'scripts/ci/security-paths.js',
    'scripts/ci/security-review-classification.js',
  ]);
  assert.match(setupNode.uses, /^actions\/setup-node@[0-9a-f]{40}$/u);
  assert.equal(
    classify.run,
    'node scripts/ci/security-review-classification.js'
  );
  const text = source('security-review-classifier.yaml');
  assert.doesNotMatch(text, /secrets\./u);
  assert.doesNotMatch(text, /uses: \.\//u);
  assert.doesNotMatch(
    text,
    /head\.ref|merge_commit_sha|bun install|npm (?:ci|install)/u
  );
  // The head SHA is only data for the check run, never a checkout ref.
  assert.equal(
    classify.env.HEAD_SHA,
    expression('github.event.pull_request.head.sha')
  );
});

test('CodeQL runs on pull requests and main pushes with the extended suite', () => {
  const on = triggers(codeql);
  assert.deepEqual(Object.keys(on).sort(), [
    'pull_request',
    'push',
    'workflow_call',
    'workflow_dispatch',
  ]);
  assert.deepEqual(on.push.branches, ['main']);
  // The only security timer lives in security-checks.yaml.
  assert.equal(on.schedule, undefined);
  assert.match(codeql.concurrency.group, /^codeql-/u);
  const analyze = codeql.jobs.analyze;
  assert.equal(analyze.needs, 'scope');
  assert.equal(
    analyze.strategy.matrix.language,
    expression('fromJSON(needs.scope.outputs.languages)')
  );
  assert.equal(analyze.permissions['security-events'], 'write');
  const [checkout, init, run, gate] = analyze.steps;
  assert.equal(checkout.with['persist-credentials'], false);
  assert.equal(init.with.queries, 'security-extended');
  assert.equal(init.with['build-mode'], 'none');
  assert.match(
    run.with.upload,
    /head\.repo\.full_name != github\.repository\) && 'never'/u
  );
  assert.equal(gate.if, "github.event_name == 'pull_request'");
  assert.match(
    gate.run,
    /git show "HEAD\^1:scripts\/ci\/codeql-new-alerts\.js"/u
  );
  assert.match(gate.env.BASELINE_REF, /default_branch/u);
});

test('security checks keep one daily timer and a weekly deep pass', () => {
  const schedules = [classifier, codeql, checks].flatMap(
    (workflow) => triggers(workflow).schedule ?? []
  );
  assert.deepEqual(schedules, [{ cron: '17 2 * * *' }]);
  const mode = checks.jobs.scope.steps.find((step) => step.id === 'mode');
  assert.match(mode.run, /date -u \+%u\)" = 1/u);
  assert.equal(checks.jobs.codeql.uses, './.github/workflows/codeql.yml');
  assert.equal(checks.jobs.codeql.if, "needs.scope.outputs.register == 'true'");
});

test('scanner tooling is verified and configured from the trusted base', () => {
  assert.match(checks.env.GITLEAKS_SHA256, /^[0-9a-f]{64}$/u);
  const steps = checks.jobs.secrets.steps;
  const install = steps.find((step) => /gitleaks/u.test(step.name ?? ''));
  assert.match(install.run, /sha256sum --check --strict/u);
  const scan = steps.find((step) => step.name === 'Scan for secrets');
  assert.match(
    scan.run,
    /git show "\$trusted:\.github\/security\/gitleaks\.toml"/u
  );
  assert.match(
    scan.run,
    /git show "\$trusted:scripts\/ci\/security-scan-diff\.js"/u
  );
  assert.match(scan.run, /--redact/u);
  assert.match(scan.run, /--ignore-gitleaks-allow/u);
  // Checkout (pull request) code may only run after the scan, its summary and
  // the register input are final; earlier it could replace the gitleaks binary
  // in RUNNER_TEMP or rewrite the scanned tree.
  const scanIndex = steps.indexOf(scan);
  for (const step of steps.slice(0, scanIndex)) {
    assert.doesNotMatch(
      String(step.run ?? ''),
      /(?:^|\s)(?:node|bun|bunx|npx|python3?|bash|sh)\s+(?:--test\s+)?(?:\.\/)?scripts\//mu,
      `${step.name} runs checkout code before the scan`
    );
    assert.ok(!step.uses?.startsWith('./'), `${step.name} runs a local action`);
  }
  const prove = steps.findIndex(
    (step) => step.name === 'Prove pull requests cannot suppress findings'
  );
  assert.equal(prove, steps.length - 1, 'suppression regression runs last');
  const audit = checks.jobs['dependency-audit'].steps.find(
    (step) => step.name === 'Audit locked dependencies'
  );
  assert.match(audit.run, /bun audit --json/u);
  assert.match(
    audit.run,
    /git show "\$BASE_SHA:scripts\/ci\/security-scan-diff\.js"/u
  );
  const review = checks.jobs['dependency-review'];
  assert.equal(
    review.if,
    "github.event_name == 'pull_request' && needs.scope.outputs.dependencies == 'true'"
  );
  assert.equal(review.steps[0].with['fail-on-severity'], 'high');
});

test('pull request scans run no package scripts and hold no secrets', () => {
  for (const file of ['security-checks.yaml', 'codeql.yml']) {
    const text = source(file);
    assert.doesNotMatch(text, /secrets\./u, file);
    assert.doesNotMatch(
      text,
      /bun install|npm (?:ci|install)|pnpm install/u,
      file
    );
  }
  for (const [file, workflow] of [
    ['security-checks.yaml', checks],
    ['codeql.yml', codeql],
  ]) {
    const on = Object.keys(triggers(workflow));
    assert.ok(!on.includes('pull_request_target'), file);
    assert.ok(!on.includes('workflow_run'), file);
    for (const [id, job] of Object.entries(workflow.jobs)) {
      const writes = Object.entries(job.permissions ?? {})
        .filter(([, level]) => level === 'write')
        .map(([scope]) => scope);
      // Code scanning uploads are the only write; fork tokens are read-only.
      assert.deepEqual(
        writes.filter((scope) => scope !== 'security-events'),
        [],
        `${file}:${id}`
      );
      for (const step of job.steps ?? []) {
        if (step.uses?.startsWith('actions/checkout@')) {
          assert.equal(
            step.with?.['persist-credentials'],
            false,
            `${file}:${id}`
          );
        }
      }
    }
  }
});

test('the register job publishes only the redacted register', () => {
  const register = checks.jobs.register;
  assert.equal(
    register.if,
    "always() && needs.scope.outputs.register == 'true'"
  );
  assert.deepEqual(register.permissions, {
    contents: 'read',
    'security-events': 'read',
  });
  const uploads = Object.values(checks.jobs)
    .flatMap((job) => job.steps ?? [])
    .filter((step) => step.uses?.startsWith('actions/upload-artifact@'));
  assert.deepEqual(
    uploads.map((step) => step.with.path).sort(),
    [
      expression('runner.temp') + '/register-input/bun-audit.json',
      expression('runner.temp') + '/register-input/gitleaks.json',
      expression('runner.temp') + '/security-register.json',
    ].sort()
  );
  const scan = checks.jobs.secrets.steps.find(
    (step) => step.name === 'Scan for secrets'
  );
  assert.match(scan.run, /mode=register/u);
});
