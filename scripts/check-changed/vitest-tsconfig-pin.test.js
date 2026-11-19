const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  WRAPPER,
  outerTsconfig,
  pinVitestTsconfig,
} = require('./vitest-tsconfig-pin.js');

function fixture(t, { outer }) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'vitest-pin-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  if (outer) fs.writeFileSync(path.join(base, 'tsconfig.json'), '{}');
  const root = path.join(base, '.worktrees', 'lane');
  const workspace = path.join(root, 'packages', 'demo');
  fs.mkdirSync(workspace, { recursive: true });
  fs.writeFileSync(path.join(root, 'tsconfig.json'), '{"files":[]}');
  fs.writeFileSync(path.join(workspace, 'tsconfig.json'), '{}');
  fs.writeFileSync(
    path.join(workspace, 'vitest.config.ts'),
    'export default {}'
  );
  return { base, root, workspace };
}

const step = {
  id: 'vitest:packages/demo',
  cwd: 'packages/demo',
  args: ['x', 'vitest', 'related', 'src/a.ts'],
};

test('a nested worktree runs Vitest through a wrapper pinning the workspace tsconfig', (t) => {
  const { base, root, workspace } = fixture(t, { outer: true });
  assert.equal(outerTsconfig(root), path.join(base, 'tsconfig.json'));
  const pin = pinVitestTsconfig(step, root);
  assert.deepEqual(pin.args, [...step.args, '--config', WRAPPER]);
  const source = fs.readFileSync(path.join(workspace, WRAPPER), 'utf8');
  assert.match(source, /import base from "\.\/vitest\.config\.ts"/u);
  assert.ok(
    source.includes(JSON.stringify(path.join(workspace, 'tsconfig.json')))
  );
  pin.cleanup();
  assert.equal(fs.existsSync(path.join(workspace, WRAPPER)), false);
});

test('standalone checkouts and non-Vitest steps keep their arguments', (t) => {
  const { root, workspace } = fixture(t, { outer: false });
  if (outerTsconfig(root))
    return t.skip('a tsconfig.json exists above the temp dir');
  assert.deepEqual(pinVitestTsconfig(step, root).args, step.args);
  assert.equal(fs.existsSync(path.join(workspace, WRAPPER)), false);
  const nested = fixture(t, { outer: true });
  const other = { ...step, id: 'bun-test:packages/demo' };
  assert.deepEqual(pinVitestTsconfig(other, nested.root).args, other.args);
});
