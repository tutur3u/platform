const assert = require('node:assert/strict');
const test = require('node:test');
const { readWorkflow } = require('./workflow-yaml-test-helper');

const env = readWorkflow('turbo-unit-tests.yaml').jobs['test-shards'].env;
const sources = {
  NEXT_PUBLIC_SUPABASE_URL: 'NEXT_PUBLIC_SUPABASE_URL',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'PRODUCTION_SUPABASE_PUBLISHABLE_KEY',
};

for (const [name, source] of Object.entries(sources)) {
  test(`${name} uses an empty PR value and preserves other event values`, () => {
    const expression = env[name].replace(/^\$\{\{\s*|\s*\}\}$/g, '');
    const evaluate = new Function(
      'github',
      'secrets',
      `return (${expression});`
    );
    const secrets = { [source]: `fixture-${source}` };
    // Same-repository PRs may have configured values available too.
    assert.equal(evaluate({ event_name: 'pull_request' }, secrets), '');
    assert.equal(evaluate({ event_name: 'pull_request' }, {}), '');
    for (const event_name of ['push', 'workflow_dispatch']) {
      assert.equal(evaluate({ event_name }, secrets), secrets[source]);
      assert.equal(evaluate({ event_name }, {}), '');
    }
  });
}

for (const name of ['PROXY_API_KEY', 'NEXT_PUBLIC_PROXY_API_KEY']) {
  test(`${name} is available only to trusted branch pushes`, () => {
    const expression = env[name].replace(/^\$\{\{\s*|\s*\}\}$/g, '');
    const evaluate = new Function(
      'github',
      'secrets',
      'startsWith',
      `return (${expression});`
    );
    const secrets = { [name]: `fixture-${name}` };
    const startsWith = (value, prefix) => value.startsWith(prefix);
    for (const event_name of [
      'pull_request',
      'pull_request_target',
      'push',
      'workflow_dispatch',
      'schedule',
    ]) {
      for (const ref of [
        'refs/heads/main',
        'refs/heads/production',
        'refs/heads/release-please--branches--production',
        'refs/heads/feature/untrusted',
        'refs/heads/main-spoof',
        'refs/tags/main',
      ]) {
        const trusted =
          event_name === 'push' &&
          [
            'refs/heads/main',
            'refs/heads/production',
            'refs/heads/release-please--branches--production',
          ].includes(ref);
        assert.equal(
          evaluate({ event_name, ref }, secrets, startsWith),
          trusted ? secrets[name] : '',
          `${event_name} ${ref}`
        );
        assert.equal(evaluate({ event_name, ref }, {}, startsWith), '');
      }
    }
  });
}
