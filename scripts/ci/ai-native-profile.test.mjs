import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { resolveAiNativeProfile } from '../../apps/ai/native-profile.ts';

test('AI profiles default to isolated staging and select production explicitly', () => {
  assert.equal(
    resolveAiNativeProfile(undefined).workerName,
    'tuturuuu-ai-vite-staging'
  );
  assert.equal(resolveAiNativeProfile('production').workerName, 'tuturuuu-ai');
  assert.throws(() => resolveAiNativeProfile('prod'), /Unknown/);
});

test('artifact identity follows the selected build profile and rejects typos', () => {
  for (const profile of ['staging', 'production']) {
    const output = execFileSync(
      'python3',
      [
        '-c',
        `
import importlib.util
s = importlib.util.spec_from_file_location('ai', 'scripts/ci/ai-native-artifact.py')
m = importlib.util.module_from_spec(s)
s.loader.exec_module(m)
print(m.load().IDENTITY['name'])
`,
      ],
      {
        env: { ...process.env, VITE_AI_NATIVE_PROFILE: profile },
        encoding: 'utf8',
      }
    );
    assert.equal(output.trim(), resolveAiNativeProfile(profile).workerName);
  }
});

test('cutover builds package both profiles without a test prerequisite', () => {
  const workflow = readFileSync('.github/workflows/ai-cloudflare.yaml', 'utf8');
  assert.match(workflow, /profile: \[staging, production\]/);
  assert.match(workflow, /vars.PRODUCTION_SUPABASE_URL/);
  assert.match(workflow, /ai-cutover-/);
  assert.match(workflow, /ai-native-artifact.py pack/);
  assert.doesNotMatch(workflow, /needs:.*native|run:.*test:runtime/);
});
