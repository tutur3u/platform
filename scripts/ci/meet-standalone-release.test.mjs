import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as actualFs from 'node:fs';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  admissionOutputs,
  admitRelease,
  releaseException,
  MAX_READ_BYTES,
  admitWorkflowRuns,
  bindProductionIntent,
  liveSource,
  validateInvocation,
  validateProductionProducer,
} from './meet-standalone-release.mjs';
import {
  emittedFiles,
  verifyArchive,
  verifyRealtime,
} from './meet-realtime-release.mjs';
import workflowHelper from './workflow-yaml-test-helper.js';

const source = 'a'.repeat(40);
const live = 'b'.repeat(40);
const env = {
  SOURCE_SHA: source,
  GITHUB_SHA: source,
  EXPECTED_SOURCE_SHA: source,
  GITHUB_REPOSITORY: 'tutur3u/platform',
  GITHUB_REF: 'refs/heads/main',
  GITHUB_EVENT_NAME: 'workflow_dispatch',
  GITHUB_RUN_ID: '10',
  GITHUB_RUN_ATTEMPT: '1',
  GH_TOKEN: 'disposable-test-token',
  MEET_PRODUCTION: 'true',
};
const metadata = {
  appName: 'meet',
  environment: 'production',
  refName: 'production',
  commitHash: live,
};
const green = {
  id: 9,
  head_sha: source,
  run_number: 9,
  run_attempt: 1,
  repository: { full_name: 'tutur3u/platform' },
  head_repository: { full_name: 'tutur3u/platform' },
  head_branch: 'main',
  event: 'push',
  status: 'completed',
  conclusion: 'success',
};

test('only pinned main dispatch or existing production invocation is admitted', () => {
  validateInvocation(env);
  validateInvocation({
    ...env,
    GITHUB_REF: 'refs/heads/production',
    EXPECTED_SOURCE_SHA: '',
  });
  // A pinned main ancestor may be released while main has moved on.
  validateInvocation({ ...env, GITHUB_SHA: live });
  assert.throws(
    () =>
      validateInvocation({
        ...env,
        GITHUB_REF: 'refs/heads/production',
        GITHUB_SHA: live,
      }),
    /MEET_RELEASE_SOURCE/
  );
  for (const mutation of [
    { SOURCE_SHA: 'main' },
    { SOURCE_SHA: live },
    { EXPECTED_SOURCE_SHA: live },
    { GITHUB_REF: 'refs/heads/feature' },
    { GITHUB_EVENT_NAME: 'push' },
    { GITHUB_REPOSITORY: 'fork/platform' },
  ])
    assert.throws(() => validateInvocation({ ...env, ...mutation }));
  validateProductionProducer(source, env);
  assert.throws(() =>
    validateProductionProducer(source, { ...env, MEET_PRODUCTION: 'false' })
  );
  assert.throws(() => validateProductionProducer(live, env));
});

test('live source comes from canonical production metadata, never a version UUID', () => {
  assert.equal(liveSource(metadata), live);
  for (const mutation of [
    { appName: 'web' },
    { environment: 'preview' },
    { refName: 'main' },
    { commitHash: '6fbb6912' },
    { commitHash: '6fbb6912-0000-4000-8000-000000000000' },
  ])
    assert.throws(() => liveSource({ ...metadata, ...mutation }));
});

test('CI requires latest exact-main completed success and excludes its own release run', () => {
  const self = {
    ...green,
    id: 10,
    run_number: 10,
    status: 'in_progress',
    conclusion: null,
  };
  assert.deepEqual(
    admitWorkflowRuns({ workflow_runs: [self, green] }, source, '10'),
    { id: 9, attempt: 1 }
  );
  for (const mutation of [
    { head_sha: live },
    { status: 'queued' },
    { conclusion: 'skipped' },
    { conclusion: 'failure' },
    { head_branch: 'production' },
    { event: 'pull_request' },
    { head_repository: { full_name: 'fork/platform' } },
  ])
    assert.throws(() =>
      admitWorkflowRuns(
        { workflow_runs: [{ ...green, ...mutation }] },
        source,
        '10'
      )
    );
  assert.throws(() =>
    admitWorkflowRuns(
      {
        workflow_runs: [
          green,
          { ...green, id: 11, run_number: 11, conclusion: 'failure' },
        ],
      },
      source,
      '10'
    )
  );
  assert.throws(() =>
    admitWorkflowRuns({ workflow_runs: [self] }, source, '10')
  );
});

test('admission checks ancestry and every exact workflow, with a fixed stop receipt', async () => {
  const commands = [];
  const urls = [];
  const receipts = [];
  const run = (_bin, args) => {
    commands.push(args);
    return args[0] === 'rev-parse' ? source : '';
  };
  const fetcher = async (url) => {
    urls.push(url);
    return {
      ok: true,
      text: async () =>
        JSON.stringify(
          new URL(url).origin === 'https://api.github.com'
            ? { workflow_runs: [green] }
            : metadata
        ),
    };
  };
  await admitRelease({
    env,
    run,
    fetcher,
    receipt: (value) => receipts.push(value),
  });
  assert.ok(
    commands.some(
      (args) =>
        args.join(' ') === `merge-base --is-ancestor ${source} FETCH_HEAD`
    )
  );
  assert.ok(
    commands.some(
      (args) => args.join(' ') === `merge-base --is-ancestor ${live} ${source}`
    )
  );
  assert.equal(urls.length, 6);
  assert.equal(receipts.at(-1).guardCode, 'MEET_RELEASE_ADMITTED');
  await assert.rejects(
    admitRelease({
      env,
      run: () => {
        throw new Error('private diagnostic');
      },
      fetcher,
      receipt: (value) => receipts.push(value),
    }),
    /MEET_RELEASE_OPERATION_FAILED:ancestry/
  );
  assert.deepEqual(receipts.at(-1), {
    guardCode: 'MEET_RELEASE_OPERATION_FAILED',
    phase: 'ancestry',
  });
  await assert.rejects(
    admitRelease({
      env,
      run,
      fetcher: async () => ({
        ok: true,
        text: async () => JSON.stringify({ ...metadata, commitHash: source }),
      }),
      receipt: (value) => receipts.push(value),
    }),
    /MEET_RELEASE_ALREADY_LIVE/
  );
  await assert.rejects(
    admitRelease({
      env,
      run: (bin, args) => {
        if (args[0] === 'merge-base' && args[2] === live)
          throw new Error('not ancestor');
        return run(bin, args);
      },
      fetcher,
      receipt: (value) => receipts.push(value),
    }),
    /MEET_RELEASE_OPERATION_FAILED:live-identity/
  );
});

test('production admission is a no-op for equal or descendant live sources and stops divergence', async () => {
  for (const relation of ['equal', 'descendant', 'divergent']) {
    const receipts = [];
    const run = (_bin, args) => {
      if (args[0] === 'rev-parse') return source;
      if (args[0] === 'merge-base' && args[3] !== 'FETCH_HEAD') {
        if (args[2] === live || relation === 'divergent')
          throw Object.assign(new Error('not ancestor'), { status: 1 });
      }
      return '';
    };
    const fetcher = async (url) => {
      assert.equal(url, 'https://meet.tuturuuu.com/api/build-info');
      return {
        ok: true,
        text: async () =>
          JSON.stringify({
            ...metadata,
            commitHash: relation === 'equal' ? source : live,
          }),
      };
    };
    const action = admitRelease({
      env: { ...env, GITHUB_REF: 'refs/heads/production' },
      run,
      fetcher,
      receipt: (value) => receipts.push(value),
    });
    if (relation === 'divergent') {
      await assert.rejects(action, /MEET_RELEASE_DIVERGENT/);
      assert.equal(receipts.at(-1).guardCode, 'MEET_RELEASE_DIVERGENT');
    } else {
      assert.equal((await action).guardCode, 'MEET_RELEASE_SUPERSEDED');
      assert.equal(receipts.at(-1).phase, 'complete');
    }
  }
});

test('realtime archive bytes must match the independent producer digest', () => {
  const root = mkdtempSync(join(tmpdir(), 'meet-archive-'));
  try {
    const archive = join(root, 'worker.tar.gz');
    writeFileSync(archive, 'qualified archive');
    const digest = createHash('sha256')
      .update(readFileSync(archive))
      .digest('hex');
    verifyArchive(archive, digest);
    assert.throws(
      () => verifyArchive(archive, undefined),
      /MEET_REALTIME_RELEASE_ARCHIVE/
    );
    writeFileSync(
      archive,
      'replacement archive with replacement internal seal'
    );
    assert.throws(
      () => verifyArchive(archive, digest),
      /MEET_REALTIME_RELEASE_ARCHIVE/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('production intent binds dispatch identity to the exact graph receipt', () => {
  const root = mkdtempSync(join(tmpdir(), 'meet-release-intent-'));
  try {
    const context = { ...env, RUNNER_TEMP: root };
    writeFileSync(
      join(root, 'meet-production-receipt.json'),
      '{"graph":"fixture"}'
    );
    bindProductionIntent('bind', context);
    bindProductionIntent('verify', context);
    bindProductionIntent('verify', { ...context, GITHUB_RUN_ATTEMPT: '2' });
    assert.throws(() =>
      bindProductionIntent('verify', { ...context, GITHUB_RUN_ATTEMPT: '0' })
    );
    for (const mutation of [
      { EXPECTED_SOURCE_SHA: live },
      { GITHUB_RUN_ID: '11' },
      { GITHUB_EVENT_NAME: 'push' },
    ])
      assert.throws(() =>
        bindProductionIntent('verify', { ...context, ...mutation })
      );
    writeFileSync(
      join(root, 'meet-production-receipt.json'),
      '{"graph":"changed"}'
    );
    assert.throws(() => bindProductionIntent('verify', context));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('realtime publication rejects altered bytes, source, hooks and symlink suppliers', () => {
  const root = mkdtempSync(join(tmpdir(), 'meet-realtime-seal-'));
  const worker = join(root, 'dist/worker');
  mkdirSync(worker, { recursive: true });
  const config = { name: 'tuturuuu-meet-realtime', main: 'index.js' };
  try {
    writeFileSync(join(worker, 'wrangler.json'), JSON.stringify(config));
    writeFileSync(join(worker, 'index.js'), 'export default {};');
    verifyRealtime('seal', source, root);
    verifyRealtime('verify', source, root);
    assert.throws(() => verifyRealtime('verify', live, root));
    writeFileSync(
      join(worker, 'index.js'),
      'export default { changed: true };'
    );
    assert.throws(() => verifyRealtime('verify', source, root));
    writeFileSync(
      join(worker, 'wrangler.json'),
      JSON.stringify({ ...config, build: { command: 'echo build' } })
    );
    assert.throws(() => verifyRealtime('seal', source, root));
    writeFileSync(join(worker, 'wrangler.json'), JSON.stringify(config));
    symlinkSync(join(worker, 'index.js'), join(worker, 'linked.js'));
    assert.throws(() => verifyRealtime('seal', source, root));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('artifact hashing rejects file, symlink and directory substitutions at open', () => {
  for (const replacement of ['file', 'symlink', 'directory']) {
    const root = mkdtempSync(join(tmpdir(), 'meet-artifact-swap-'));
    try {
      const target = join(root, 'entry.js');
      writeFileSync(target, 'qualified bytes');
      let swapped = false;
      const fsImpl = {
        ...actualFs,
        openSync(path, flags) {
          if (path === target && !swapped) {
            swapped = true;
            actualFs.renameSync(target, join(root, 'retained.js'));
            if (replacement === 'file') writeFileSync(target, 'replacement');
            else if (replacement === 'directory') mkdirSync(target);
            else symlinkSync(join(root, 'retained.js'), target);
          }
          return actualFs.openSync(path, flags);
        },
      };
      assert.throws(() => emittedFiles(root, { fsImpl }));
      assert.equal(swapped, true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test('workflow keeps admission, policy, serialization, token isolation and no-bundle realtime publish', () => {
  const workflow = workflowHelper.readWorkflow('meet-cloudflare.yaml', {
    raw: true,
  });
  assert.equal(workflow.on.workflow_dispatch.inputs.release.default, false);
  assert.equal(
    workflow.jobs.deploy.concurrency.group,
    'meet-cloudflare-production-deploy'
  );
  assert.equal(workflow.jobs.deploy.concurrency['cancel-in-progress'], false);
  assert.match(
    workflow.jobs.deploy.if,
    /needs.production-policy.outputs.allowed == 'true'/
  );
  assert.equal(workflow.jobs.deploy.env.CLOUDFLARE_API_TOKEN, undefined);
  assert.equal(workflow.jobs.validate.env?.CLOUDFLARE_API_TOKEN, undefined);
  for (const job of ['production-policy', 'deploy']) {
    const gate = workflow.jobs[job].steps.find(
      (step) => step.name === 'Admit exact Meet release'
    );
    assert.equal(gate.if, undefined);
    assert.match(gate.run, /meet-standalone-release.mjs/);
  }
  assert.equal(
    workflow.jobs.deploy.environment,
    "${{ vars.MEET_DEDICATED_PRODUCTION_ENV_READY == 'true' && 'meet-cloudflare-production' || 'meet-production' }}"
  );
  assert.equal(
    workflow.jobs.validate.outputs.realtime_sha256,
    '${{ steps.realtime-seal.outputs.sha256 }}'
  );
  const deploy = workflow.jobs.deploy.steps;
  const restore = deploy.find(
    (step) => step.name === 'Restore verified realtime artifact'
  );
  assert.equal(
    restore.env.EXPECTED_REALTIME_SHA256,
    '${{ needs.validate.outputs.realtime_sha256 }}'
  );
  assert.ok(restore.run.indexOf(' archive ') < restore.run.indexOf('tar -xzf'));
  for (const step of deploy.filter(
    (step) =>
      step.env?.CLOUDFLARE_API_TOKEN &&
      !step.name?.startsWith('Restore the previous')
  ))
    assert.equal(step.if, "steps.admission.outputs.superseded != 'true'");
  assert.equal(
    deploy.find(
      (step) => step.name === 'Record successful Cloudflare deployment'
    ).if,
    "steps.admission.outputs.superseded != 'true'"
  );
  const publish = deploy.find((step) => step.id === 'signaling');
  assert.match(
    publish.run,
    /wrangler deploy --no-bundle -c apps\/meet-realtime\/dist\/worker\/wrangler.json/
  );
  assert.match(publish.run, /meet-realtime-release.mjs verify/);
  assert.ok(publish.env.CLOUDFLARE_API_TOKEN);
  for (const step of deploy.filter((step) =>
    /bun install|fixture-supplier|native-launcher/.test(step.run ?? '')
  ))
    assert.equal(step.env?.CLOUDFLARE_API_TOKEN, undefined);
  const rollback = deploy.find(
    (step) =>
      step.name === 'Restore the previous Meet pair after a failed release'
  );
  assert.match(rollback.if, /failure\(\) \|\| cancelled\(\)/);
  assert.match(
    readFileSync(
      new URL('./meet-release-operations.sh', import.meta.url),
      'utf8'
    ),
    /versions deploy "\$target@100%"/
  );
});

test('canonical identity check tolerates only the admitted previous live commit within a bounded step', () => {
  const workflow = workflowHelper.readWorkflow('meet-cloudflare.yaml', {
    raw: true,
  });
  const identity = workflow.jobs.deploy.steps.find(
    (step) => step.name === 'Verify canonical frontend build identity'
  );
  assert.equal(
    identity.env.MEET_PREVIOUS_LIVE_SHA,
    '${{ steps.admission.outputs.live }}'
  );
  assert.ok(identity['timeout-minutes'] <= 10);
  assert.notEqual(identity['continue-on-error'], true);
});

test('admission outputs carry only a full previous live commit', () => {
  const live = 'a'.repeat(40);
  assert.equal(
    admissionOutputs({ guardCode: 'MEET_RELEASE_ADMITTED', live }),
    `superseded=false\nlive=${live}\n`
  );
  assert.equal(
    admissionOutputs({ guardCode: 'MEET_RELEASE_SUPERSEDED', live }),
    `superseded=true\nlive=${live}\n`
  );
  for (const value of [undefined, 'local', `${live}\nsuperseded=false`])
    assert.equal(
      admissionOutputs({ guardCode: 'MEET_RELEASE_ADMITTED', live: value }),
      'superseded=false\n'
    );
});

test('admission reads run pages up to the bounded size', async () => {
  const run = (_bin, args) => (args[0] === 'rev-parse' ? source : '');
  const page = (bytes) => async (url) => ({
    ok: true,
    text: async () =>
      JSON.stringify(
        new URL(url).origin === 'https://api.github.com'
          ? { workflow_runs: [green], padding: 'x'.repeat(bytes) }
          : metadata
      ),
  });
  const admitted = [];
  await admitRelease({
    env,
    run,
    fetcher: page(600 * 1024),
    receipt: (value) => admitted.push(value),
  });
  assert.equal(admitted.at(-1).guardCode, 'MEET_RELEASE_ADMITTED');
  await assert.rejects(
    admitRelease({
      env,
      run,
      fetcher: page(MAX_READ_BYTES),
      receipt: () => {},
    }),
    /MEET_RELEASE_READ_TOO_LARGE/
  );
});

test("the policy job admits a pinned main ancestor from main's head checkout", async () => {
  const head = 'c'.repeat(40);
  const commands = [];
  const run = (_bin, args) => {
    commands.push(args.join(' '));
    return args[0] === 'rev-parse' ? head : '';
  };
  const fetcher = async (url) => ({
    ok: true,
    text: async () =>
      JSON.stringify(
        new URL(url).origin === 'https://api.github.com'
          ? { workflow_runs: [green] }
          : metadata
      ),
  });
  const receipts = [];
  await admitRelease({
    env: { ...env, GITHUB_SHA: head },
    run,
    fetcher,
    receipt: (value) => receipts.push(value),
  });
  assert.equal(receipts.at(-1).guardCode, 'MEET_RELEASE_ADMITTED');
  assert.ok(commands.includes(`cat-file -e ${source}^{commit}`));
  assert.ok(commands.includes(`merge-base --is-ancestor ${source} FETCH_HEAD`));
  // Any other checkout, or a production push, must be the source itself.
  for (const mutation of [
    { GITHUB_SHA: 'd'.repeat(40) },
    { GITHUB_REF: 'refs/heads/production', GITHUB_SHA: head },
  ])
    await assert.rejects(
      admitRelease({
        env: { ...env, ...mutation, EXPECTED_SOURCE_SHA: source },
        run,
        fetcher,
        receipt: () => {},
      }),
      /MEET_RELEASE_(CHECKOUT|SOURCE)/
    );
});

const RA = {
  id: 'RA-TEST-1',
  source,
  workflows: ['turbo-unit-tests.yaml'],
  expires: '2026-11-22T16:59:00Z',
};
const before = Date.parse('2026-11-21T06:00:00Z');

function exceptionScenario({
  unitRun = { ...green, conclusion: 'failure' },
} = {}) {
  const run = (_bin, args) => {
    if (args[0] === 'rev-parse') return source;
    if (args[0] === 'ls-tree') return 'apps/meet\n';
    if (args[0] === 'show') return JSON.stringify({ name: '@tuturuuu/meet' });
    return '';
  };
  const fetcher = async (url) => {
    const parsed = new URL(url);
    let body = metadata;
    if (parsed.origin === 'https://api.github.com') {
      if (parsed.pathname.includes('/turbo-unit-tests.yaml/'))
        body = {
          workflow_runs:
            parsed.searchParams.get('status') === 'success' ? [] : [unitRun],
        };
      else body = { workflow_runs: [green] };
    }
    return { ok: true, text: async () => JSON.stringify(body) };
  };
  return { run, fetcher };
}

test('a recorded risk acceptance admits only its shared workflow on its exact source', async () => {
  const { run, fetcher } = exceptionScenario();
  const receipts = [];
  await assert.rejects(
    admitRelease({
      env,
      run,
      fetcher,
      now: () => before,
      exceptions: [],
      receipt: () => {},
    }),
    /MEET_RELEASE_CI_NOT_GREEN/
  );
  await admitRelease({
    env,
    run,
    fetcher,
    now: () => before,
    exceptions: [RA],
    receipt: (value) => receipts.push(value),
  });
  const admitted = receipts.at(-1);
  assert.equal(admitted.guardCode, 'MEET_RELEASE_ADMITTED');
  assert.equal(admitted.checks['turbo-unit-tests.yaml'].exception, 'RA-TEST-1');
  assert.equal(admitted.checks['turbo-unit-tests.yaml'].conclusion, 'failure');
  for (const exceptions of [
    [{ ...RA, expires: '2026-11-21T05:00:00Z' }],
    [{ ...RA, source: live }],
    [{ ...RA, workflows: ['type-check.yaml'] }],
  ])
    await assert.rejects(
      admitRelease({
        env,
        run,
        fetcher,
        now: () => before,
        exceptions,
        receipt: () => {},
      }),
      /MEET_RELEASE_CI_NOT_GREEN/
    );
});

test('a risk acceptance never covers an unfinished run or a Meet or security workflow', async () => {
  for (const unitRun of [
    { ...green, status: 'in_progress', conclusion: null },
    { ...green, conclusion: 'cancelled' },
    { ...green, conclusion: 'skipped' },
    { ...green, conclusion: 'startup_failure' },
  ]) {
    const scenario = exceptionScenario({ unitRun });
    await assert.rejects(
      admitRelease({
        env,
        ...scenario,
        now: () => before,
        exceptions: [RA],
        receipt: () => {},
      }),
      /MEET_RELEASE_CI_NOT_GREEN/
    );
  }
  for (const record of [
    { ...RA, id: '' },
    { ...RA, workflows: 'turbo-unit-tests.yaml' },
  ])
    assert.equal(
      releaseException(source, 'turbo-unit-tests.yaml', before, [record]),
      undefined
    );
  for (const workflow of ['meet-cloudflare.yaml', 'security-checks.yaml'])
    assert.equal(
      releaseException(source, workflow, before, [
        { ...RA, workflows: [workflow] },
      ]),
      undefined
    );
  assert.equal(
    releaseException(source, 'turbo-unit-tests.yaml', before, [RA]),
    RA
  );
});
