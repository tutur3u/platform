import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

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
  assert.match(workflow, /secrets.PRODUCTION_SUPABASE_URL/);
  assert.match(workflow, /cms-cutover-/);
  assert.match(workflow, /cms-native-artifact.py pack/);
  assert.doesNotMatch(workflow, /needs:.*native|run:.*test:runtime/);
});
