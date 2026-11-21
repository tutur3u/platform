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
const { join, resolve } = require('node:path');
const test = require('node:test');
const { readWorkflow } = require('./workflow-yaml-test-helper');

const PR_HEAD_SOURCE =
  '${{ github.event.pull_request.head.sha || github.sha }}';

/**
 * Evaluates a source-SHA workflow expression for one event. It accepts only
 * the `github.*` and `inputs.*` references, string literals, `==`, `&&`, `||`
 * and parentheses these expressions use, so it parses rather than evals.
 */
function evaluateSourceExpression(expression, { github, inputs }) {
  const body = expression.replace(/^\$\{\{\s*|\s*\}\}$/g, '');
  const tokens = body.match(/\s+|'[^']*'|==|&&|\|\||[()]|[A-Za-z_][\w.]*/g);
  assert.equal(tokens.join(''), body, 'unsupported expression syntax');
  const values = tokens.filter((token) => !/^\s+$/.test(token));
  const read = (path) =>
    path
      .split('.')
      .slice(1)
      .reduce(
        (value, key) => value?.[key],
        path.startsWith('inputs.') ? inputs : github
      );
  let index = 0;
  const primary = () => {
    const token = values[index++];
    if (token === '(') {
      const value = or();
      assert.equal(values[index++], ')');
      return value;
    }
    if (token.startsWith("'")) return token.slice(1, -1);
    assert.match(token, /^(github|inputs)\./u, `unexpected reference ${token}`);
    return read(token);
  };
  // GitHub compares strings case-insensitively.
  const fold = (value) =>
    typeof value === 'string' ? value.toLowerCase() : value;
  const equality = () => {
    let value = primary();
    while (values[index] === '==') {
      index++;
      value = fold(value) === fold(primary());
    }
    return value;
  };
  const and = () => {
    let value = equality();
    while (values[index] === '&&') {
      index++;
      const right = equality();
      value = value ? right : value;
    }
    return value;
  };
  const or = () => {
    let value = and();
    while (values[index] === '||') {
      index++;
      const right = and();
      value = value || right;
    }
    return value;
  };
  const result = or();
  assert.equal(index, values.length, 'trailing expression tokens');
  return result;
}

function sourceIdentityTests({
  app,
  workflowName,
  jobName,
  source,
  sourceExpression = PR_HEAD_SOURCE,
}) {
  const workflow = readWorkflow(workflowName);
  const job = workflow.jobs[jobName];
  const selected = `\${{ env.${source} }}`;
  const step = (name) => {
    const matches = job.steps.filter((item) => item.name === name);
    assert.equal(matches.length, 1, name);
    return matches[0];
  };
  const debug = () => {
    const selected = step(
      'Verify and pack failed-job sealed source for debugging'
    );
    if (app !== 'meet') return selected;
    assert.equal(
      selected.run,
      'bash scripts/ci/meet-release-operations.sh debug-pack'
    );
    const operations = readFileSync(
      resolve(__dirname, 'meet-release-operations.sh'),
      'utf8'
    );
    const run = operations
      .split('  debug-pack)\n')[1]
      .split('    ;;')[0]
      .split('\n')
      .map((line) => line.replace(/^    /, ''))
      .join('\n')
      .trim();
    return { ...selected, run };
  };
  const prefix = app.toUpperCase();

  test(`${app} selects the PR head and preserves separate workflow supplier identity`, () => {
    assert.equal((job.env ?? workflow.env)[source], sourceExpression);
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
        "(github.ref == 'refs/heads/production' || (github.event_name == 'workflow_dispatch' && inputs.release == true)) && needs.production-policy.outputs.allowed == 'true'"
      );
      // The marker names the published source, which a release dispatch pins.
      const marker = workflow.jobs.deploy.steps.find(
        (item) => item.env?.DEPLOYMENT_MARKER_SHA
      );
      assert.equal(marker.env.DEPLOYMENT_MARKER_SHA, selected);
    }
  });

  if (app === 'meet') {
    test('meet release dispatch builds its pinned main source and nothing else', () => {
      const expression = (job.env ?? workflow.env)[source];
      const head = 'a'.repeat(40),
        event = 'b'.repeat(40),
        pinned = 'c'.repeat(40);
      const pick = (github, inputs) =>
        evaluateSourceExpression(expression, { github, inputs });
      const dispatch = {
        event_name: 'workflow_dispatch',
        sha: event,
        event: {},
      };
      // A PR always builds its head, whatever the dispatch inputs say.
      assert.equal(
        pick(
          {
            event_name: 'pull_request',
            sha: event,
            event: { pull_request: { head: { sha: head } } },
          },
          { release: true, source_sha: pinned }
        ),
        head
      );
      // A release dispatch builds the pinned main commit, not the dispatch head.
      assert.equal(
        pick(dispatch, { release: true, source_sha: pinned }),
        pinned
      );
      // Without the release flag, or from another event, the pin is ignored.
      assert.equal(
        pick(dispatch, { release: false, source_sha: pinned }),
        event
      );
      assert.equal(
        pick(
          { event_name: 'push', sha: event, event: {} },
          { release: true, source_sha: pinned }
        ),
        event
      );
      // A release without a pin falls back to the event commit; admission then
      // rejects it because EXPECTED_SOURCE_SHA is empty.
      assert.equal(pick(dispatch, { release: true, source_sha: '' }), event);
      assert.equal(
        workflow.env.EXPECTED_SOURCE_SHA,
        '${{ inputs.source_sha }}'
      );
      const inputs = workflow.on.workflow_dispatch.inputs;
      assert.equal(inputs.release.type, 'boolean');
      assert.equal(inputs.release.default, false);
      assert.equal(inputs.source_sha.type, 'string');
      // Both jobs that touch the source check it out and verify HEAD against it.
      for (const name of ['validate', 'deploy']) {
        const steps = workflow.jobs[name].steps;
        assert.ok(
          steps.some((item) => item.with?.ref === selected),
          `${name} checks out the selected source`
        );
        assert.ok(
          steps.some((item) =>
            item.run?.includes(`test "$(git rev-parse HEAD)" = "$${source}"`)
          ),
          `${name} verifies HEAD is the selected source`
        );
      }
    });
  }

  test(`${app} PR-head/event-merge negative control keeps source, event and supplier distinct`, (t) => {
    const root = realpathSync(
      mkdtempSync(join(tmpdir(), 'native-source-identity-'))
    );
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const head = 'a'.repeat(40),
      event = 'b'.repeat(40),
      supplier = 'c'.repeat(40);
    mkdirSync(join(root, 'bin'));
    if (app === 'meet') {
      mkdirSync(join(root, 'scripts/ci'), { recursive: true });
      writeFileSync(
        join(root, 'scripts/ci/meet-release-operations.sh'),
        readFileSync(resolve(__dirname, 'meet-release-operations.sh'))
      );
    }
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
      // The step consumes the supplier's receipt output and fails closed
      // without it.
      assert.equal(
        runtime.env.MEET_FIXTURE_RECEIPT,
        '${{ steps.meet-fixture-supplier.outputs.receipt }}'
      );
      const supplierStep = job.steps.find(
        (item) => item.id === 'meet-fixture-supplier'
      );
      assert.equal(
        supplierStep.run,
        'node scripts/ci/meet-native-fixture-supplier.mjs "$SOURCE_SHA" "$RUNNER_TEMP"'
      );
      assert.ok(
        job.steps.indexOf(supplierStep) < job.steps.indexOf(runtime),
        'fixture supplier must run before the runtime verifier'
      );
      assert.notEqual(run(runtime.run).status, 0);
      const fixtureReceipt = join(root, 'meet-fixture-receipt.json');
      writeFileSync(fixtureReceipt, '{}\n', { flag: 'wx', mode: 0o600 });
      assert.equal(
        run(runtime.run, { MEET_FIXTURE_RECEIPT: fixtureReceipt }).status,
        0
      );
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
    const routeResult = run(
      step(`Capture generated ${title} route tree evidence`).run
    );
    assert.equal(routeResult.status, 0, routeResult.stderr);
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
module.exports = { evaluateSourceExpression, sourceIdentityTests };
