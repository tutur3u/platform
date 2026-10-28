const assert = require('node:assert/strict');
const test = require('node:test');
const { readWorkflow } = require('./workflow-yaml-test-helper');

const env = readWorkflow('turbo-unit-tests.yaml').jobs['test-shards'].env;
const sources = {
  NEXT_PUBLIC_SUPABASE_URL: 'NEXT_PUBLIC_SUPABASE_URL',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'PRODUCTION_SUPABASE_PUBLISHABLE_KEY',
  PROXY_API_KEY: 'PROXY_API_KEY',
  NEXT_PUBLIC_PROXY_API_KEY: 'NEXT_PUBLIC_PROXY_API_KEY',
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
