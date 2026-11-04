import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
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

test('cutover builds package both profiles and exercise the emitted runtime', () => {
  const workflow = readFileSync(
    '.github/workflows/cms-cloudflare.yaml',
    'utf8'
  );
  assert.match(workflow, /profile: \[staging, production\]/);
  assert.match(workflow, /vars\[format\('\{0\}_SUPABASE_URL'/);
  assert.match(workflow, /cms-cutover-/);
  assert.match(workflow, /cms-native-artifact.py pack/);
  const parsed = JSON.parse(
    execFileSync(
      'bun',
      [
        '-e',
        `console.log(JSON.stringify(Bun.YAML.parse(await Bun.file('.github/workflows/cms-cloudflare.yaml').text())))`,
      ],
      { encoding: 'utf8' }
    )
  );
  const runtime = parsed.jobs['cutover-build'].steps.find(
    (step) => step.run === 'bun run test:runtime'
  );
  assert.equal(runtime?.['working-directory'], 'apps/cms');
  assert.equal(runtime?.env.CI, 'true');
  assert.equal(runtime?.env.CI_SOURCE_SHA, '$' + '{{ env.SOURCE_SHA }}');
  const fixture = readFileSync(
    'apps/cms/cloudflare/native-built-worker.runtime.mjs',
    'utf8'
  );
  for (const name of [
    'TUTURUUU_APP_COORDINATION_SECRET',
    'SUPABASE_SECRET_KEY',
  ]) {
    assert.match(fixture, new RegExp(`${name}: \\{\\s*type: 'secret_text'`));
  }
  assert.match(fixture, /randomBytes\(32\)/);
  assert.match(fixture, /config.preview_urls, false/);
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

test('startup transform matches a checkout path containing spaces and percent-encoded characters', () => {
  const config = readFileSync('apps/cms/vite.config.mts', 'utf8');
  const body = config.match(/transform\(code, id\) \{([\s\S]*?)\n {6}\},/)[1];
  const checkout = '/tmp/native checkout #fixture/apps/cms';
  const url = pathToFileURL(`${checkout}/vite.config.mts`).href;
  const transform = runInNewContext(
    `(function(code, id) {${body.replaceAll('import.meta.url', JSON.stringify(url))}})`,
    { fileURLToPath, URL }
  );
  const output = transform(
    'export default {};',
    `${checkout}/cloudflare/worker.ts?worker`
  );
  assert.match(output?.code ?? '', /nativeStartupEnv/);
  assert.equal(
    transform('export default {};', '/another/worker.ts'),
    undefined
  );
});
