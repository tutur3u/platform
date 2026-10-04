const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { afterEach, test } = require('node:test');
const {
  createSatelliteBacklog,
  checkOrWriteSatelliteBacklog,
} = require('./tanstack-satellite-backlog.js');
const fixtures = [];
afterEach(() => {
  for (const root of fixtures.splice(0))
    fs.rmSync(root, { recursive: true, force: true });
});
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ttr-satellite-backlog-'));
  fixtures.push(root);
  const source = 'apps/learn/src/app/api/fixture/route.ts';
  fs.mkdirSync(path.dirname(path.join(root, source)), { recursive: true });
  fs.writeFileSync(path.join(root, source), 'export function GET() {}');
  fs.mkdirSync(path.join(root, 'apps/tanstack-web/migration'), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(
      root,
      'apps/tanstack-web/migration/satellite-route-overrides.json'
    ),
    JSON.stringify({
      routes: {
        [`api:/api/fixture:${source}`]: {
          status: 'legacy-next',
          targetOwner: 'rust-backend',
          note: 'Preserve satellite authorization.',
        },
      },
    })
  );
  return { root, source: path.join(root, source) };
}
test('satellite API ownership becomes stale when its methods change', () => {
  const { root, source } = fixture();
  assert.equal(createSatelliteBacklog(root).count, 1);
  checkOrWriteSatelliteBacklog({ root });
  assert.equal(checkOrWriteSatelliteBacklog({ root, check: true }), true);
  fs.writeFileSync(
    source,
    'export function GET() {}\nexport function POST() {}'
  );
  assert.equal(checkOrWriteSatelliteBacklog({ root, check: true }), false);
});
test('a registered route cannot silently disappear from the migration backlog', () => {
  const { root, source } = fixture();
  fs.unlinkSync(source);
  assert.throws(() => createSatelliteBacklog(root), /unknown route/);
});
