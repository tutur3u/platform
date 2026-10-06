const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { fileURLToPath } = require('node:url');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const contactsRoot = path.join(root, 'apps/contacts');

for (const subpath of ['calendar-series', 'calendar-provider-series']) {
  test(`Contacts resolves the public internal API ${subpath} export`, () => {
    // Node's actual ESM resolver enforces package exports before returning the
    // target. It can resolve the dist URL without building the package locally.
    // No TypeScript/Vitest alias may bypass the manifest in this regression.
    const resolved = execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `console.log(import.meta.resolve('@tuturuuu/internal-api/${subpath}'))`,
      ],
      { cwd: contactsRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    ).trim();
    const target = fileURLToPath(resolved);
    const packageRoot = fs.realpathSync(path.dirname(path.dirname(target)));
    assert.equal(
      path.join(packageRoot, 'dist', path.basename(target)),
      path.join(root, 'packages/internal-api/dist', `${subpath}.js`)
    );
    assert.equal(
      fs.existsSync(
        path.join(root, 'packages/internal-api/src', `${subpath}.ts`)
      ),
      true,
      'the public target must have a build input'
    );
  });
}
