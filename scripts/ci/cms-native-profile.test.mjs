import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

test('artifact identity follows the selected build profile and rejects typos', () => {
  for (const profile of ['staging', 'production']) {
    const output = execFileSync(
      'python3',
      [
        '-c',
        `
import importlib.util
s = importlib.util.spec_from_file_location('ai', 'scripts/ci/cms-native-artifact.py')
m = importlib.util.module_from_spec(s)
s.loader.exec_module(m)
print(m.load().IDENTITY['name'])
`,
      ],
      {
        env: { ...process.env, VITE_CMS_NATIVE_PROFILE: profile },
        encoding: 'utf8',
      }
    );
    assert.equal(
      output.trim(),
      profile === 'production' ? 'tuturuuu-cms' : 'tuturuuu-cms-vite-staging'
    );
  }
});

test('cutover builds package both profiles without a test prerequisite', () => {
  const workflow = readFileSync(
    '.github/workflows/cms-cloudflare.yaml',
    'utf8'
  );
  assert.match(workflow, /profile: \[staging, production\]/);
  assert.match(workflow, /vars\[format\('\{0\}_SUPABASE_URL'/);
  assert.match(workflow, /cms-cutover-/);
  assert.match(workflow, /cms-native-artifact.py pack/);
  assert.doesNotMatch(workflow, /needs:.*native|run:.*test:runtime/);
});

test('startup refuses missing secrets, development keys and non-production mode', () => {
  const config = readFileSync('apps/cms/vite.config.mts', 'utf8');
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
    '.github/workflows/cms-cloudflare.yaml',
    'utf8'
  );
  assert.doesNotMatch(workflow, /secrets\./);
  assert.match(workflow, /cms-cutover-smoke.mjs/);
  assert.match(workflow, /native-emitted-config-receipt.mjs/);
});
