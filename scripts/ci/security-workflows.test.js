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
  // The only scan timer lives in security-checks.yaml (the review sweep is
  // a separate API-only backstop).
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
  const auditSteps = checks.jobs['dependency-audit'].steps;
  const audit = auditSteps.find(
    (step) => step.name === 'Audit locked dependencies'
  );
  // The verified bun runs by absolute path; nothing from the checkout (local
  // action, setup script or GITHUB_PATH change) runs before the audit.
  assert.match(checks.env.BUN_SHA256, /^[0-9a-f]{64}$/u);
  assert.match(audit.run, /"\$BUN_BIN" audit --json/u);
  assert.doesNotMatch(audit.run, /(?:^|[\s(])bun audit/mu);
  assert.equal(audit.env.BUN_BIN, `${expression('runner.temp')}/bun-bin/bun`);
  for (const step of auditSteps.slice(0, auditSteps.indexOf(audit))) {
    assert.ok(!step.uses?.startsWith('./'), `${step.name} runs a local action`);
    assert.doesNotMatch(
      String(step.run ?? ''),
      /scripts\/|GITHUB_PATH|\.github\//u,
      `${step.name} runs checkout code before the audit`
    );
  }
  const bunInstall = auditSteps.find((step) =>
    /checksum-verified bun/u.test(step.name ?? '')
  );
  assert.match(bunInstall.run, /sha256sum --check --strict/u);
  // No gate ever falls back to the checkout's copy of a trusted helper.
  for (const file of ['security-checks.yaml', 'codeql.yml']) {
    assert.doesNotMatch(source(file), /\bcp\s+scripts\//u, file);
  }
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
      `${expression('runner.temp')}/register-input/bun-audit.json`,
      `${expression('runner.temp')}/register-input/gitleaks.json`,
      `${expression('runner.temp')}/security-register.json`,
    ].sort()
  );
  const scan = checks.jobs.secrets.steps.find(
    (step) => step.name === 'Scan for secrets'
  );
  assert.match(scan.run, /mode=register/u);
});

// REV-6456-9: a hostile checkout copy of any switchboard or scope selector
// (for example overflow-notes-ci.js emitting should_run=false) must not be
// able to skip or decide a gate. No security job may call the ci-check
// switchboard or execute a checkout-local script or local action, apart from
// steps that run after their job's verdict is final.
test('no checkout-local selector or helper can skip or decide a security gate', () => {
  const postVerdict = new Set([
    'secrets/Prove pull requests cannot suppress findings',
  ]);
  // Workflow trust boundaries is itself a test run of the change (like unit
  // tests); it gates nothing else and is not a scanner verdict.
  const testJobs = new Set(['security-checks.yaml/workflow-trust']);
  const executes =
    /(?:^|[\s;&|(])(?:node|bun|bunx|npx|python3?|bash|sh)\s+(?:--[\w-]+(?:=\S+)?\s+)*["']?(?:\.\/)?(?:scripts|\.github)\//mu;
  for (const [file, workflow] of [
    ['security-checks.yaml', checks],
    ['codeql.yml', codeql],
  ]) {
    assert.doesNotMatch(source(file), /ci-check\.yml/u, `${file} switchboard`);
    for (const [id, job] of Object.entries(workflow.jobs)) {
      if (job.uses) {
        assert.equal(
          job.uses,
          './.github/workflows/codeql.yml',
          `${file}:${id}`
        );
        continue;
      }
      if (testJobs.has(`${file}/${id}`)) continue;
      // Register-only jobs run on main's schedule (or a dispatch), never for a
      // pull request, so main's own code builds the register.
      if (
        /^always\(\) && needs\.scope\.outputs\.register == 'true'$/u.test(
          job.if ?? ''
        )
      ) {
        continue;
      }
      for (const need of [job.needs ?? []].flat()) {
        assert.ok(workflow.jobs[need], `${file}:${id} needs ${need}`);
      }
      for (const step of job.steps ?? []) {
        if (postVerdict.has(`${id}/${step.name}`)) continue;
        assert.ok(
          !step.uses?.startsWith('./'),
          `${file}:${id}:${step.name} runs a local action`
        );
        assert.doesNotMatch(
          String(step.run ?? ''),
          executes,
          `${file}:${id}:${step.name} executes checkout code`
        );
      }
    }
  }
  for (const id of postVerdict) {
    const [job, name] = id.split('/');
    const steps = checks.jobs[job].steps;
    assert.equal(steps.at(-1).name, name, `${id} must stay the last step`);
  }
});

// CodeRabbit 4360337349: any workflow holding checks: write could post a
// same-named "Security review" check through GITHUB_TOKEN, and every such
// check comes from the shared github-actions app. Until a dedicated GitHub App
// writes the check (a repository-setting decision, see security-cadence.mdx),
// only the three Security review writers may request checks: write.
test('only the Security review writers can write check runs', () => {
  const writers = [];
  for (const file of fs.readdirSync(workflowsDir).sort()) {
    if (!/\.ya?ml$/u.test(file)) continue;
    const text = source(file);
    assert.doesNotMatch(text, /permissions:\s*write-all/u, file);
    if (/^\s*checks:\s*write\b/mu.test(text)) writers.push(file);
  }
  assert.deepEqual(writers, [
    'security-review-classifier.yaml',
    'security-review-reclassify.yaml',
    'security-review-sweep.yaml',
  ]);
});
