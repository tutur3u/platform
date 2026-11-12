/** CI-parity qualification; run through the host's admission wrapper. Never deploys. */
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const app = fileURLToPath(new URL('../', import.meta.url));
const root = resolve(app, '../..');
const env = { ...process.env };
for (const name of [
  'GH_TOKEN',
  'GITHUB_TOKEN',
  'GH_ENTERPRISE_TOKEN',
  'GITHUB_ENTERPRISE_TOKEN',
])
  delete env[name];
Object.assign(env, {
  CI: 'true',
  TUTURUUU_NOINDEX: '1',
  NEXT_PUBLIC_APP_URL: 'https://marketing.tuturuuu.com',
  NEXT_PUBLIC_WEB_APP_URL: 'https://tuturuuu.com',
  NEXT_PUBLIC_SUPABASE_URL:
    env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://marketing-ci.supabase.invalid',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    'sb_publishable_marketing_ci_placeholder',
  CI_SOURCE_SHA: execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim(),
});
function run(command, args, cwd = root, capture = false) {
  console.log(`check:native: ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${command} ${args.join(' ')} failed`);
  return result.stdout?.trim();
}
const harness = join(app, '.native-env-check.tsconfig.json');
assert.ok(
  !existsSync(harness),
  'refuse to overwrite an existing binding harness'
);
const scratch = mkdtempSync(join(tmpdir(), 'marketing-native-check-'));
try {
  run('node', ['--test', 'scripts/ci/wrangler-usage-guard.test.js']);
  // These are the owning native-start-app.yaml commands, including its separate binding program.
  run('bun', ['run', 'type-check'], app);
  run('bun', ['run', 'build:cloudflare'], app);
  env.GITHUB_OUTPUT = join(scratch, 'output');
  run('python3', ['scripts/ci/marketing-native-artifact.py', 'config', app]);
  const config = readFileSync(env.GITHUB_OUTPUT, 'utf8')
    .split('\n')
    .find((line) => line.startsWith('config='))
    ?.slice(7);
  assert.ok(config, 'emitted config discovery must succeed');
  run(
    'bun',
    [
      'x',
      '--no-install',
      'wrangler',
      'types',
      '--config',
      config,
      '--env-interface',
      'MarketingGeneratedEnv',
      '--include-runtime=false',
      join(scratch, 'native-env.d.ts'),
    ],
    app
  );
  const binding = run(
    'python3',
    [
      'scripts/ci/native-binding-type-harness.py',
      '--app-dir',
      app,
      '--generated',
      join(scratch, 'native-env.d.ts'),
      '--env-interface',
      'MarketingGeneratedEnv',
      '--worker-type',
      'MarketingEnvironment',
      '--out',
      join(scratch, 'native-env-check'),
    ],
    root,
    true
  );
  run('bun', ['x', '--no-install', 'tsc', '--project', binding]);
  run('bun', [
    '--eval',
    "await import('./apps/marketing/start-bridge.config.ts')",
  ]);
  run('node', [
    '--input-type=module',
    '--eval',
    "await import('./apps/marketing/start-bridge.config.ts')",
  ]);
  run('node', ['--test', 'scripts/ci/reserved-staging-names.test.mjs']);
  run('bun', ['run', 'test:runtime'], app);
} finally {
  rmSync(harness, { force: true });
  rmSync(scratch, { recursive: true, force: true });
}
