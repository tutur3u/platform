// biome-ignore-all lint/suspicious/noTemplateCurlyInString: GitHub expressions are tested as literal YAML values.
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const test = require('node:test');
const { readWorkflow } = require('./workflow-yaml-test-helper');

function sourceIdentityTests({ app, workflowName, jobName, source }) {
  const workflow = readWorkflow(workflowName);
  const job = workflow.jobs[jobName];
  const selected = `\${{ env.${source} }}`;
  const step = (name) => {
    const matches = job.steps.filter((item) => item.name === name);
    assert.equal(matches.length, 1, name);
    return matches[0];
  };
  const debug = () =>
    step('Verify and pack failed-job sealed source for debugging');
  const prefix = app.toUpperCase();

  test(`${app} selects the PR head and preserves separate workflow supplier identity`, () => {
    assert.equal(
      (job.env ?? workflow.env)[source],
      '${{ github.event.pull_request.head.sha || github.sha }}'
    );
    const checkout = job.steps.find((item) =>
      item.uses?.startsWith('actions/checkout@')
    );
    assert.equal(checkout.with.ref, selected);
    assert.equal(checkout.with['persist-credentials'], false);
    assert.equal(debug().env.WORKFLOW_SOURCE_SHA, '${{ github.workflow_sha }}');
    const receipt = step(`Record bounded ${app} native emitted config receipt`);
    assert.equal(receipt.if, 'always()');
    assert.equal(
      receipt.run,
      `node scripts/ci/native-emitted-config-receipt.mjs apps/${app} "$${source}" "$RUNNER_TEMP/native-emitted-config-${app}.json"`
    );
    const upload = step(
      `Retain generated ${app === 'apps' ? 'Apps' : app === 'meet' ? 'Meet' : 'Calendar'} route tree evidence`
    );
    assert.equal(
      upload.with.name,
      `${app}-route-tree-${selected}-` +
        '${{ github.run_id }}-${{ github.run_attempt }}'
    );
    assert.equal(upload.with.path, `\${{ runner.temp }}/${upload.with.name}/`);
    if (app === 'meet') {
      assert.equal(
        step('Generate shared build metadata').env.PLATFORM_BUILD_COMMIT_HASH,
        selected
      );
      const preflight = workflow.jobs['check-ci'];
      assert.equal(preflight.uses, './.github/workflows/ci-check.yml');
      assert.equal(preflight.with.check_pr_release_only, true);
      const check = readWorkflow('ci-check.yml').jobs.check;
      const comparison = check.steps.find((item) =>
        item.uses?.startsWith('actions/checkout@')
      );
      assert.equal(comparison.with.ref, '${{ github.sha }}');
      const relevance = check.steps.find(
        (item) => item.id === 'pr_release_relevance'
      );
      assert.equal(
        relevance.env.BASE_SHA,
        '${{ github.event.pull_request.base.sha }}'
      );
      assert.equal(
        relevance.env.HEAD_SHA,
        '${{ github.event.pull_request.head.sha }}'
      );
      assert.equal(
        workflow.jobs.deploy.if,
        "github.ref == 'refs/heads/production' && needs.production-policy.outputs.allowed == 'true'"
      );
      const marker = workflow.jobs.deploy.steps.find(
        (item) => item.env?.DEPLOYMENT_MARKER_SHA
      );
      assert.equal(marker.env.DEPLOYMENT_MARKER_SHA, '${{ github.sha }}');
    }
  });

  test(`${app} PR-head/event-merge negative control keeps source, event and supplier distinct`, (t) => {
    const root = realpathSync(
      mkdtempSync(join(tmpdir(), 'native-source-identity-'))
    );
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const head = 'a'.repeat(40),
      event = 'b'.repeat(40),
      supplier = 'c'.repeat(40);
    mkdirSync(join(root, 'bin'));
    // Command sinks exercise workflow shell plumbing without a Worker or build.
    const fakeGit = join(root, 'bin/git');
    writeFileSync(
      fakeGit,
      '#!/bin/sh\nif [ "$1" = rev-parse ]; then printf "%s\\n" "$FIXTURE_HEAD"; else exit 1; fi\n'
    );
    chmodSync(fakeGit, 0o700);
    const fakeNode = join(root, 'bin/node');
    writeFileSync(
      fakeNode,
      '#!/bin/sh\nprintf "%s\\n" "$GITHUB_SHA" "$@" > "$RUNNER_TEMP/command-input.txt"\n'
    );
    chmodSync(fakeNode, 0o700);
    const fakePython = join(root, 'bin/python3');
    writeFileSync(
      fakePython,
      '#!/bin/sh\nprintf "%s\\n" "$GITHUB_SHA" "$APPS_SOURCE_SHA" "$@" > "$RUNNER_TEMP/command-input.txt"\n'
    );
    chmodSync(fakePython, 0o700);
    const env = {
      ...process.env,
      PATH: `${join(root, 'bin')}:${process.env.PATH}`,
      RUNNER_TEMP: root,
      [source]: head,
      FIXTURE_HEAD: head,
      GITHUB_SHA: event,
      WORKFLOW_SOURCE_SHA: supplier,
      GITHUB_EVENT_NAME: 'pull_request',
      GITHUB_RUN_ID: '123',
      GITHUB_RUN_ATTEMPT: '2',
      [`${prefix}_ROUTE_TREE_BEFORE`]: 'absent',
      [`${prefix}_FRONTEND_BUILD_OUTCOME`]: 'failure',
      CALENDAR_NATIVE_BUILD_OUTCOME: 'failure',
    };
    const run = (command, overrides = {}) =>
      spawnSync('bash', ['-eu', '-c', command], {
        cwd: root,
        env: { ...env, ...overrides },
        encoding: 'utf8',
      });
    const guard = debug().run.split('\n')[0];
    assert.equal(run(guard).status, 0);
    assert.notEqual(run(guard, { FIXTURE_HEAD: event }).status, 0);
    const metadata = debug()
      .run.split('\n')
      .find((line) => line.trim().startsWith('printf '));
    assert.equal(run(metadata).status, 0);
    const text = readFileSync(
      join(root, `${app}-debug-sealed-source.txt`),
      'utf8'
    );
    assert.ok(
      text.includes(
        `expected_source_sha=${head}\ncheckout_head=${head}\ngithub_sha=${event}\nworkflow_source_sha=${supplier}\n`
      )
    );
    const verify = debug().run.split('\n')[1];
    assert.equal(run(verify).status, 0);
    const input = readFileSync(join(root, 'command-input.txt'), 'utf8').split(
      '\n'
    );
    if (app === 'meet') {
      assert.equal(input[0], head);
      assert.equal(
        run(verify.replace('GITHUB_SHA="$SOURCE_SHA" ', '')).status,
        0
      );
      assert.notEqual(
        readFileSync(join(root, 'command-input.txt'), 'utf8').split('\n')[0],
        head
      );
      const runtime = step(
        'Verify emitted Start SSR, auth, cookies, rewrites and Live guards'
      );
      assert.equal(run(runtime.run).status, 0);
      assert.equal(
        readFileSync(join(root, 'command-input.txt'), 'utf8').split('\n')[0],
        head
      );
    } else {
      assert.ok(input.includes(head));
      assert.equal(input[0], event);
    }
    const routeDir = join(root, `apps/${app}/src`);
    mkdirSync(routeDir, { recursive: true });
    writeFileSync(join(routeDir, 'routeTree.gen.ts'), '// generated fixture\n');
    writeFileSync(join(root, 'bun.lock'), 'fixture');
    const title =
      app === 'apps' ? 'Apps' : app === 'meet' ? 'Meet' : 'Calendar';
    assert.equal(
      run(step(`Capture generated ${title} route tree evidence`).run).status,
      0
    );
    const routeReceipt = readFileSync(
      join(root, `${app}-route-tree-${head}-123-2/source-receipt.txt`),
      'utf8'
    );
    assert.ok(
      routeReceipt.includes(
        `expected_source_sha=${head}\nsource_head=${head}\ngithub_sha=${event}\n`
      )
    );
    assert.ok(routeReceipt.includes('source_origin=fresh-bootstrap\n'));
    const receipt = step(`Record bounded ${app} native emitted config receipt`);
    assert.equal(run(receipt.run).status, 0);
    const receiptInput = readFileSync(
      join(root, 'command-input.txt'),
      'utf8'
    ).split('\n');
    assert.equal(receiptInput[0], event);
    assert.equal(receiptInput[3], head);
  });
}
module.exports = { sourceIdentityTests };
