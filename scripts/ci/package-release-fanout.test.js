const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {
  readWorkflowJobBlock,
  repoRoot,
} = require('./workflow-config-test-helpers');

const consumers = fs
  .readdirSync(path.join(repoRoot, '.github/workflows'))
  .filter((name) => /^release-.+-package\.yaml$/.test(name))
  .filter((name) =>
    fs
      .readFileSync(path.join(repoRoot, '.github/workflows', name), 'utf8')
      .includes('  dispatch-dependent-releases:')
  );

function script(name) {
  const job = readWorkflowJobBlock(name, 'dispatch-dependent-releases');
  const match = job.match(/ {10}node <<'NODE'\n([\s\S]*?) {10}NODE(?:\n|$)/);
  assert.ok(match, `Missing inline fanout in ${name}`);
  return match[1]
    .split('\n')
    .map((line) => line.slice(10))
    .join('\n');
}

async function execute(source, response) {
  const calls = [];
  const errors = [];
  let exitCode;
  await vm.runInNewContext(source, {
    process: {
      env: {
        DEPENDENT_WORKFLOWS: JSON.stringify([
          'release-sdk-package.yaml',
          'release-ui-package.yaml',
        ]),
        GH_TOKEN: 'synthetic-token',
        GITHUB_REPOSITORY: 'tutur3u/platform',
        GITHUB_REF_NAME: 'production',
      },
      exit: (code) => {
        exitCode = code;
      },
    },
    console: { log() {}, error: (message) => errors.push(message) },
    fetch: async (url, options) => {
      calls.push({ url, method: options.method });
      return response(url, options);
    },
  });
  return { calls, errors, exitCode };
}

test('all sixteen package fanout consumers use the same inline implementation', () => {
  assert.equal(consumers.length, 16);
  assert.equal(new Set(consumers.map(script)).size, 1);
});

for (const name of consumers) {
  test(`${name}: disabled SDK never POSTs and does not block UI`, async () => {
    for (const state of ['disabled_manually']) {
      const result = await execute(script(name), async (url, options) => {
        if (options.method === 'GET')
          return {
            ok: true,
            json: async () => ({
              state: url.endsWith('release-sdk-package.yaml')
                ? state
                : 'active',
            }),
          };
        assert.ok(url.endsWith('release-ui-package.yaml/dispatches'));
        return { ok: true };
      });
      assert.equal(result.exitCode, undefined, result.errors.join('\n'));
      assert.deepEqual(
        result.calls.map((entry) => entry.method),
        ['GET', 'GET', 'POST']
      );
    }
  });

  test(`${name}: unreadable or unknown workflow state never POSTs`, async () => {
    for (const response of [
      { ok: false, status: 403, statusText: 'Forbidden' },
      { ok: true, json: async () => ({ state: 'disabled_inactivity' }) },
      { ok: true, json: async () => ({ state: 'unknown' }) },
      {
        ok: true,
        json: async () => {
          throw new Error('invalid JSON');
        },
      },
    ]) {
      const result = await execute(script(name), async () => response);
      assert.equal(result.exitCode, 1);
      assert.deepEqual(
        result.calls.map((entry) => entry.method),
        ['GET']
      );
    }
  });

  test(`${name}: active dispatch errors remain fatal, including HTTP 422`, async () => {
    const result = await execute(script(name), async (_url, options) =>
      options.method === 'GET'
        ? { ok: true, json: async () => ({ state: 'active' }) }
        : {
            ok: false,
            status: 422,
            statusText: 'Unprocessable Entity',
            text: async () => 'other validation failure',
          }
    );
    assert.equal(result.exitCode, 1);
    assert.deepEqual(
      result.calls.map((entry) => entry.method),
      ['GET', 'POST']
    );
    assert.match(result.errors.join('\n'), /422/);
  });
}
