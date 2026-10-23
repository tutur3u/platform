const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

function assertNoBotReferences(workflows) {
  for (const [name, content] of Object.entries(workflows)) {
    assert.doesNotMatch(
      content,
      /TUTURUUU_BOT_|tuturuuu-bot-token/,
      `${name}: local bot credentials/helper are forbidden in Actions`
    );
  }
}

test('every workflow is free of local bot configuration and helper references', () => {
  const dir = path.resolve(__dirname, '../../.github/workflows');
  const workflows = Object.fromEntries(
    fs
      .readdirSync(dir)
      .filter((name) => /\.ya?ml$/.test(name))
      .map((name) => [name, fs.readFileSync(path.join(dir, name), 'utf8')])
  );
  assertNoBotReferences(workflows);
});

test('bot references are forbidden anywhere, including comments and non-minting jobs', () => {
  for (const content of [
    '# TUTURUUU_BOT_APP_ID',
    'env: TUTURUUU_BOT_PRIVATE_KEY',
    'run: node scripts/tuturuuu-bot-token.js',
    'secret: TUTURUUU_BOT_FUTURE',
  ]) {
    assert.throws(() => assertNoBotReferences({ 'unrelated.yaml': content }));
  }
});

test('unrelated workflow edits do not cause inventory snapshot drift', () => {
  assertNoBotReferences({
    'other.yaml': 'on: pull_request\njobs: changed-by-another-PR',
  });
});

test('manifest is private and inactive with only local push and PR creation permissions', () => {
  const manifest = JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, '../../.github/tuturuuu-bot/manifest.json')
    )
  );
  assert.equal(manifest.public, false);
  assert.equal(manifest.hook_attributes.active, false);
  assert.deepEqual(manifest.default_events, []);
  assert.deepEqual(manifest.default_permissions, {
    contents: 'write',
    pull_requests: 'write',
    metadata: 'read',
  });
});
