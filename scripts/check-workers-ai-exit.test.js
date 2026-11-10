const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');
const {
  bindingFindings,
  invocationFindings,
  main,
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

test('rejects optional, bracket, and destructured Workers AI bindings', () => {
  const source = [
    `await env?.${'AI'}.run()`,
    `await bindings?.${'AI'}.run()`,
    `await bindings.${'AI'}.run()`,
    `await env["${'AI'}"].run()`,
    `const { ${'AI'} } = env`,
    `const { ${'AI'}, ROOMS } = bindings`,
  ].join('\n');
  assert.deepEqual(invocationFindings(source, 'apps/example/ai.ts'), [
    'apps/example/ai.ts:1: calls env.AI',
    'apps/example/ai.ts:2: calls env.AI',
    'apps/example/ai.ts:3: calls env.AI',
    'apps/example/ai.ts:4: calls env.AI',
    'apps/example/ai.ts:5: calls env.AI',
    'apps/example/ai.ts:6: calls env.AI',
  ]);
});

test('ignores env.AI names that are not the Workers AI binding', () => {
  assert.deepEqual(
    invocationFindings(
      [
        'const key = env.AI_GATEWAY_API_KEY ?? process.env.AI_APP_URL;',
        'const token = bindings?.AI_GATEWAY_TOKEN;',
        'const { AI_GATEWAY } = env;',
      ].join('\n'),
      'apps/ai/src/lib/speech-execution.ts'
    ),
    []
  );
});

test('main prints findings and exits 1', () => {
  const script = path.join(__dirname, 'check-workers-ai-exit.js');
  const result = spawnSync(
    process.execPath,
    [
      '-e',
      `const { main } = require(${JSON.stringify(script)});\nmain(['apps/example/ai.ts:1: calls env.AI']);`,
    ],
    { encoding: 'utf8' }
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Workers AI exit check failed/);
  assert.match(result.stderr, /calls env\.AI/);
});

test('running the guard directly exits 0 on this tree', () => {
  const result = spawnSync(
    process.execPath,
    [path.join(__dirname, 'check-workers-ai-exit.js')],
    { encoding: 'utf8' }
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Workers AI exit check passed/);
});

test('ignores @cf model ids inside type declarations', () => {
  const source = `type Model = '${'@'}cf/meta/llama';`;
  assert.deepEqual(invocationFindings(source, 'worker-configuration.d.ts'), []);
  assert.deepEqual(invocationFindings(source, 'apps/example/ai.ts'), [
    'apps/example/ai.ts:1: uses a Workers AI @cf/ model id',
  ]);
});
