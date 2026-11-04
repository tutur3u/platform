import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

test('Finance cutover builds both existing profiles with environment-specific public keys', () => {
  const output = execFileSync(
    'bun',
    [
      '-e',
      `console.log(JSON.stringify(Bun.YAML.parse(await Bun.file('.github/workflows/finance-cloudflare.yaml').text())))`,
    ],
    { encoding: 'utf8' }
  );
  const workflow = JSON.parse(output);
  const job = workflow.jobs['cutover-build'];
  assert.deepEqual(job.strategy.matrix.profile, ['staging', 'production']);
  assert.equal(
    job.env.VITE_FINANCE_NATIVE_PROFILE,
    '$' + '{{ matrix.profile }}'
  );
  assert.match(job.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, /vars\[format/);
  assert.equal(job.env.NEXT_PUBLIC_WEB_APP_URL, undefined);
  assert.match(job.env.NEXT_PUBLIC_SUPABASE_URL, /vars\[format/);
  assert.ok(
    job.steps.some((step) => step.with?.name?.startsWith('finance-cutover-'))
  );
  assert.ok(
    job.steps.some((step) =>
      step.run?.includes('finance-native-artifact.py pack')
    )
  );
});

test('startup refuses missing secrets, development keys and non-production mode', () => {
  const config = readFileSync('apps/finance/vite.config.mts', 'utf8');
  const guard = config
    .match(/code: `([\s\S]*?)\$\{code\}`/)[1]
    .replace(
      /import \{ env as nativeStartupEnv \} from 'cloudflare:workers';/,
      ''
    );
  const valid = {
    TUTURUUU_APP_COORDINATION_SECRET: 'synthetic-coordination-key',
    SUPABASE_SECRET_KEY: 'synthetic-service-key',
  };
  const execute = (env, mode = 'production') =>
    runInNewContext(guard, {
      nativeStartupEnv: env,
      process: { env: { NODE_ENV: mode } },
    });
  assert.doesNotThrow(() => execute(valid));
  for (const name of Object.keys(valid)) {
    const missing = { ...valid };
    delete missing[name];
    assert.throws(() => execute(missing), new RegExp(name));
    assert.throws(
      () =>
        execute({
          ...valid,
          [name]: '  tuturuuu-local-development-app-coordination-secret  ',
        }),
      /unsafe required secret/
    );
  }
  assert.throws(
    () => execute(valid, 'development'),
    /requires NODE_ENV=production/
  );
  assert.throws(
    () =>
      execute({
        ...valid,
        APP_COORDINATION_TOKEN_SECRET:
          'tuturuuu-local-development-app-coordination-secret',
      }),
    /Development signing secret/
  );
  const workflow = readFileSync(
    '.github/workflows/finance-cloudflare.yaml',
    'utf8'
  );
  assert.doesNotMatch(workflow, /secrets\./);
  assert.match(workflow, /finance-cutover-smoke.mjs/);
  assert.match(workflow, /native-emitted-config-receipt.mjs/);
});
