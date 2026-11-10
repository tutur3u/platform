const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const {
  bindingFindings,
  invocationFindings,
  workersAiFindings,
} = require('./check-workers-ai-exit');

const repoRoot = path.resolve(__dirname, '..');

test('no Worker config binds Workers AI and no source calls env.AI', () => {
  assert.deepEqual(workersAiFindings(repoRoot), []);
});

test('rejects an ai binding in Worker config', () => {
  const source = `{ "${'ai'}": { "binding": "AI" } }`;
  assert.deepEqual(bindingFindings(source, 'apps/example/config.jsonc'), [
    'apps/example/config.jsonc: declares an ai binding',
  ]);
});

test('rejects a toml ai binding section', () => {
  const source = `[${'ai'}]\nbinding = "AI"\n`;
  assert.deepEqual(bindingFindings(source, 'apps/example/config.toml'), [
    'apps/example/config.toml: declares an ai binding',
  ]);
});

test('ignores an explicit disabled ai flag and unrelated bindings', () => {
  assert.deepEqual(
    bindingFindings(
      '{ "bindings": { "ai": false }, "assets": { "binding": "ASSETS" } }',
      'void.config.ts'
    ),
    []
  );
});

test('rejects an env.AI call and a Workers AI model id', () => {
  const source = [
    `await env.${'AI'}.run('${'@'}cf/meta/llama-3.3-70b-instruct-fp8-fast', {})`,
    `fetch('https://api.cloudflare.com/client/v4/accounts/x${'/ai/run/'}model')`,
    `provider: '${'workers'}-ai'`,
  ].join('\n');
  assert.deepEqual(invocationFindings(source, 'apps/example/ai.ts'), [
    'apps/example/ai.ts:1: calls env.AI',
    'apps/example/ai.ts:1: uses a Workers AI @cf/ model id',
    'apps/example/ai.ts:2: calls the Workers AI REST /ai/run/ API',
    'apps/example/ai.ts:3: routes through workers-ai',
  ]);
});

test('ignores env.AI names that are not the Workers AI binding', () => {
  assert.deepEqual(
    invocationFindings(
      'const key = env.AI_GATEWAY_API_KEY ?? process.env.AI_APP_URL;',
      'apps/ai/src/lib/speech-execution.ts'
    ),
    []
  );
});

test('ignores @cf model ids inside type declarations', () => {
  const source = `type Model = '${'@'}cf/meta/llama';`;
  assert.deepEqual(invocationFindings(source, 'worker-configuration.d.ts'), []);
  assert.deepEqual(invocationFindings(source, 'apps/example/ai.ts'), [
    'apps/example/ai.ts:1: uses a Workers AI @cf/ model id',
  ]);
});
