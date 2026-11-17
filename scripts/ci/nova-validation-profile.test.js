const assert = require('node:assert/strict');
const test = require('node:test');
const { renderTemplate } = require('./github-expression-test-helper');
const { readWorkflow } = require('./workflow-yaml-test-helper');

test('Nova validation builds the public root and indexing policy of each artifact', () => {
  const native = readWorkflow('nova-cloudflare.yaml').jobs.native;
  for (const profile of native.strategy.matrix.profile) {
    const rendered = renderTemplate(native.with['public-env'], {
      matrix: { profile },
      github: { event_name: 'push' },
      vars: {},
    });
    const values = Object.fromEntries(
      rendered
        .trim()
        .split('\n')
        .map((line) => {
          const separator = line.indexOf('=');
          return [line.slice(0, separator), line.slice(separator + 1)];
        })
    );
    assert.equal(
      values.NEXT_PUBLIC_APP_URL,
      profile === 'production'
        ? 'https://tuturuuu.com/nova'
        : 'https://nova.ai.vn'
    );
    assert.equal(values.TUTURUUU_NOINDEX, profile === 'production' ? '0' : '1');
  }
});
