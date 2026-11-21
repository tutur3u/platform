const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { collect } = require('./generate-docs-inventory');

function tempRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-inventory-'));
  const write = (file, content) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), content);
  };
  write('apps/admin/package.json', JSON.stringify({ name: '@tuturuuu/admin' }));
  write('packages/ui/package.json', JSON.stringify({ name: '@tuturuuu/ui' }));
  return { root, write };
}

test('skips directories that hold only ignored build output', (t) => {
  const { root, write } = tempRepo();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  // A moved workspace leaves its ignored output behind in reused checkouts.
  write('apps/infrastructure/node_modules/.bin/tool', '');
  write('apps/infrastructure/.turbo/turbo-build.log', '');
  write('packages/old/dist/index.js', '');

  const { apps, manifests } = collect(root);
  assert.deepEqual(
    apps.map((app) => app.name),
    ['admin']
  );
  assert.deepEqual(
    manifests.map((entry) => entry.directory),
    ['apps/admin', 'packages/ui']
  );
});

test('keeps a directory that has source next to its build output', (t) => {
  const { root, write } = tempRepo();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  write('apps/tool/node_modules/.bin/x', '');
  write('apps/tool/README.md', '# Tool');

  assert.deepEqual(
    collect(root).apps.map((app) => app.name),
    ['admin', 'tool']
  );
});
