const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { walkArtifact } = require('./worktree-footprint-safety.js');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'footprint-safety-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const artifact = path.join(root, 'artifact');
  fs.mkdirSync(path.join(artifact, 'deep'), { recursive: true });
  const file = path.join(artifact, 'deep/keep');
  fs.writeFileSync(file, 'keep');
  return { root, artifact, file };
}

for (const limit of [{ maxDepth: 0 }, { maxEntries: 1 }]) {
  test(`checkout scan preserves artifacts on ${JSON.stringify(limit)}`, (t) => {
    const { artifact, file } = fixture(t);
    assert.equal(walkArtifact(artifact, limit), 'artifact-scan-unknown');
    assert.equal(fs.readFileSync(file, 'utf8'), 'keep');
  });
}

test('deleting walk unlinks symlinks without visiting their targets', (t) => {
  const { root, artifact } = fixture(t);
  const outside = path.join(root, 'outside');
  fs.mkdirSync(path.join(outside, '.git'), { recursive: true });
  fs.writeFileSync(path.join(outside, 'keep'), 'checkout data');
  fs.symlinkSync(outside, path.join(artifact, 'linked-checkout'));
  assert.equal(walkArtifact(artifact, { remove: true }), null);
  assert.equal(fs.existsSync(artifact), false);
  assert.equal(
    fs.readFileSync(path.join(outside, 'keep'), 'utf8'),
    'checkout data'
  );
});
