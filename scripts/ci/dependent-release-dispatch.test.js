const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const workflowsDir = path.resolve(__dirname, '../../.github/workflows');

function releaseWorkflowNames() {
  return fs
    .readdirSync(workflowsDir)
    .filter((name) => /^release-.*-package\.yaml$/u.test(name))
    .sort();
}

function extractDispatchScript(workflowName) {
  const source = fs.readFileSync(
    path.join(workflowsDir, workflowName),
    'utf8'
  );
  const jobStart = source.indexOf('\n  dispatch-dependent-releases:\n');

  assert.notEqual(jobStart, -1, `${workflowName} is missing the dispatch job`);

  const job = source.slice(jobStart);
  const nextJob = job.slice(1).search(/\n {2}[A-Za-z0-9_-]+:\n/u);
  const jobBlock = nextJob === -1 ? job : job.slice(0, nextJob + 1);
  const scriptStart = jobBlock.indexOf("node <<'NODE'\n");

  assert.notEqual(scriptStart, -1, `${workflowName} is missing the dispatch script`);

  const from = scriptStart + "node <<'NODE'\n".length;
  const end = jobBlock.indexOf('\n          NODE', from);

  assert.notEqual(end, -1, `${workflowName} dispatch script is not closed`);

  return jobBlock
    .slice(from, end)
    .split('\n')
    .map((line) => (line.startsWith('          ') ? line.slice(10) : line))
    .join('\n');
}

function runDispatchScript({ handlers, workflows }) {
  const script = extractDispatchScript('release-types-package.yaml');
  const tracePath = path.join(
    os.tmpdir(),
    `dependent-dispatch-${process.pid}-${Date.now()}.json`
  );
  const program = `
const fs = require('node:fs');
const handlers = ${JSON.stringify(handlers)};
const requests = [];
const realExit = process.exit.bind(process);

function writeTrace(code) {
  fs.writeFileSync(
    process.env.DISPATCH_TRACE,
    JSON.stringify({ code, requests })
  );
}

process.exit = (code = 0) => {
  writeTrace(code);
  realExit(code);
};
process.on('beforeExit', () => {
  if (!fs.existsSync(process.env.DISPATCH_TRACE)) {
    writeTrace(process.exitCode ?? 0);
  }
});

globalThis.fetch = async (url, options = {}) => {
  const method = options.method || 'GET';
  const workflowName = decodeURIComponent(
    url.split('/actions/workflows/')[1].split(/[/?#]/u)[0]
  );
  requests.push({ method, workflowName });
  const handler = handlers[workflowName] || {};
  const posting = method === 'POST';
  const status = posting
    ? handler.dispatchStatus ?? 204
    : handler.readStatus ?? 200;
  const body = posting
    ? handler.dispatchBody ?? ''
    : handler.readBody ??
      JSON.stringify({ state: handler.state || 'active' });

  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: posting
      ? handler.dispatchStatusText || (status === 204 ? 'No Content' : 'Error')
      : handler.readStatusText || (status === 200 ? 'OK' : 'Error'),
    async text() {
      return body;
    },
  };
};

${script}
`;
  const result = spawnSync(process.execPath, ['-e', program], {
    encoding: 'utf8',
    env: {
      DEPENDENT_WORKFLOWS: JSON.stringify(workflows),
      DISPATCH_TRACE: tracePath,
      GH_TOKEN: 'token',
      GITHUB_REF_NAME: 'production',
      GITHUB_REPOSITORY: 'tutur3u/platform',
      PATH: process.env.PATH,
    },
  });

  let trace = { code: result.status, requests: [] };

  if (fs.existsSync(tracePath)) {
    trace = JSON.parse(fs.readFileSync(tracePath, 'utf8'));
    fs.unlinkSync(tracePath);
  }

  return {
    status: result.status,
    stderr: result.stderr,
    stdout: result.stdout,
    trace,
  };
}

test('every package release workflow uses the same inactive-workflow skip', () => {
  const names = releaseWorkflowNames();

  assert.deepEqual(names.length, 16);

  const scripts = names.map((name) => extractDispatchScript(name));

  for (const script of scripts) {
    assert.equal(script, scripts[0]);
    assert.match(script, /workflow state is \$\{workflowState\}/);
    assert.match(script, /status === 422 && \/disabled workflow\/i\.test\(body\)/);
    assert.match(script, /Unable to dispatch \$\{workflowName\}/);
    assert.doesNotMatch(script, /workflow enable|actions: write|npm publish/);
  }
});

test('the dispatch step skips an inactive workflow and dispatches the active one', () => {
  const result = runDispatchScript({
    handlers: {
      'release-sdk-package.yaml': { state: 'disabled_manually' },
      'release-ui-package.yaml': { state: 'active', dispatchStatus: 204 },
    },
    workflows: ['release-sdk-package.yaml', 'release-ui-package.yaml'],
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(
    result.stdout,
    /Skipping release-sdk-package\.yaml: workflow state is disabled_manually\./
  );
  assert.match(result.stdout, /Dispatched release-ui-package\.yaml on production\./);
  assert.deepEqual(result.trace.requests, [
    { method: 'GET', workflowName: 'release-sdk-package.yaml' },
    { method: 'GET', workflowName: 'release-ui-package.yaml' },
    { method: 'POST', workflowName: 'release-ui-package.yaml' },
  ]);
});

test('the dispatch step logs a disabled-workflow 422 and fails every other error', () => {
  const disabledDispatch = runDispatchScript({
    handlers: {
      'release-sdk-package.yaml': {
        state: 'active',
        dispatchStatus: 422,
        dispatchStatusText: 'Unprocessable Entity',
        dispatchBody: JSON.stringify({
          message: 'Cannot trigger workflow_dispatch on a disabled workflow',
        }),
      },
      'release-ui-package.yaml': { state: 'active', dispatchStatus: 204 },
    },
    workflows: ['release-sdk-package.yaml', 'release-ui-package.yaml'],
  });

  assert.equal(disabledDispatch.status, 0, disabledDispatch.stderr);
  assert.match(
    disabledDispatch.stdout,
    /Skipping release-sdk-package\.yaml: workflow is disabled \(422\)\./
  );
  assert.match(
    disabledDispatch.stdout,
    /Dispatched release-ui-package\.yaml on production\./
  );

  const otherDispatchError = runDispatchScript({
    handlers: {
      'release-ui-package.yaml': {
        state: 'active',
        dispatchStatus: 422,
        dispatchStatusText: 'Unprocessable Entity',
        dispatchBody: JSON.stringify({
          message: 'Workflow does not have workflow_dispatch trigger',
        }),
      },
    },
    workflows: ['release-ui-package.yaml'],
  });

  assert.equal(otherDispatchError.status, 1);
  assert.match(otherDispatchError.stderr, /::error::Unable to dispatch release-ui-package\.yaml/);
  assert.match(otherDispatchError.stderr, /workflow_dispatch trigger/);
  assert.doesNotMatch(otherDispatchError.stdout, /Skipping/);

  const readError = runDispatchScript({
    handlers: {
      'release-sdk-package.yaml': {
        readStatus: 500,
        readStatusText: 'Server Error',
        readBody: 'boom',
      },
    },
    workflows: ['release-sdk-package.yaml'],
  });

  assert.equal(readError.status, 1);
  assert.match(
    readError.stderr,
    /::error::Unable to read release-sdk-package\.yaml: 500 Server Error boom/
  );
  assert.deepEqual(readError.trace.requests, [
    { method: 'GET', workflowName: 'release-sdk-package.yaml' },
  ]);

  const missingState = runDispatchScript({
    handlers: {
      'release-sdk-package.yaml': { readBody: '{}' },
    },
    workflows: ['release-sdk-package.yaml'],
  });

  assert.equal(missingState.status, 1);
  assert.match(missingState.stderr, /workflow state is missing/);
});
