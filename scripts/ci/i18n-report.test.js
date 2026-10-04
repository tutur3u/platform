const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const workflow = fs.readFileSync(
  path.resolve(__dirname, '../../.github/workflows/i18n-check.yaml'),
  'utf8'
);
const source = workflow
  .slice(workflow.indexOf('          script: |') + '          script: |'.length)
  .replace(/^ {12}/gm, '');
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
async function report({
  result = 'success',
  output,
  liveHead = 'head',
  previous = '',
  runId = 20,
  attempt = 1,
} = {}) {
  const writes = [];
  const script = source.replace(/\$\{\{ (.*?) \}\}/g, (_, key) => {
    if (key === 'github.run_attempt') return String(attempt);
    if (key.endsWith('.result')) return result;
    if (output !== undefined) return output;
    return key.endsWith('.is_sorted')
      ? 'true'
      : key.endsWith('.has_issues')
        ? 'false'
        : '0';
  });
  const github = {
    paginate: async () =>
      previous
        ? [
            {
              id: 3,
              user: { login: 'github-actions[bot]' },
              body: `<!-- i18n-check-comment -->\n${previous}`,
            },
          ]
        : [],
    rest: {
      pulls: {
        get: async () => ({ data: { state: 'open', head: { sha: liveHead } } }),
      },
      issues: {
        listComments() {},
        updateComment: async (value) => writes.push(value.body),
        createComment: async (value) => writes.push(value.body),
      },
    },
  };
  await new AsyncFunction('github', 'context', 'console', script)(
    github,
    {
      runId,
      repo: { owner: 'o', repo: 'r' },
      payload: { pull_request: { number: 1, head: { sha: 'head' } } },
    },
    { log() {} }
  );
  return writes;
}
test('completed passing outputs establish green', async () => {
  assert.match((await report())[0], /All i18n checks passed/);
});
for (const result of ['cancelled', 'skipped', 'failure', 'success', '']) {
  test(`missing outputs are incomplete for ${result || 'unknown'}`, async () => {
    const body = (await report({ result, output: '' }))[0];
    assert.match(body, /i18n validation incomplete/);
    assert.doesNotMatch(
      body,
      /Not sorted|All in sync|Keys in sync|All present|Sorting Issues/
    );
  });
}
test('confirmed sort failure suggests sorting only', async () => {
  const body = (await report({ result: 'failure', output: 'false' }))[0];
  assert.match(body, /Confirmed i18n issues found/);
  assert.match(body, /Not sorted/);
  assert.match(body, /Sorting Issues/);
  assert.doesNotMatch(body, /All in sync|Translation Issues/);
});
test('cancelled output cannot claim failure or success', async () => {
  assert.match(
    (await report({ result: 'cancelled', output: 'true' }))[0],
    /validation incomplete/
  );
});
test('superseded head cannot write', async () => {
  assert.deepEqual(await report({ liveHead: 'new' }), []);
});
test('older run and attempt cannot overwrite newer reports', async () => {
  assert.deepEqual(
    await report({ previous: '<!-- i18n-check-run:21:1 -->' }),
    []
  );
  assert.deepEqual(
    await report({ previous: '<!-- i18n-check-run:20:2 -->' }),
    []
  );
  assert.equal(
    (await report({ previous: '<!-- i18n-check-run:19:1 -->' })).length,
    1
  );
});
