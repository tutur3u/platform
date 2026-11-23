const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const {
  findUnlistedMeetRoutes,
  parseJsonc,
} = require('./check-meet-tsconfig-routes.js');

function fixture(include, routes) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meet-routes-'));
  const app = path.join(root, 'apps/meet');
  fs.mkdirSync(app, { recursive: true });
  fs.writeFileSync(
    path.join(app, 'tsconfig.app.json'),
    `{\n  // routes are listed by name\n  "include": ${JSON.stringify(include)},\n}\n`
  );
  for (const route of routes) {
    const file = path.join(app, route);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'export {};\n');
  }
  return root;
}

test('reports route handlers missing from the Meet app tsconfig', () => {
  const root = fixture(
    ['src/app/api/a/route.ts'],
    ['src/app/api/a/route.ts', 'src/app/api/[id]/b/route.ts', 'src/app/page.tsx']
  );
  assert.deepEqual(findUnlistedMeetRoutes(root), ['src/app/api/[id]/b/route.ts']);
});

test('passes when every route handler is listed', () => {
  const root = fixture(['src/app/api/a/route.ts'], ['src/app/api/a/route.ts']);
  assert.deepEqual(findUnlistedMeetRoutes(root), []);
});

test('parses comments and trailing commas in tsconfig', () => {
  assert.deepEqual(parseJsonc('{ /* c */ "a": [1,], // x\n }'), { a: [1] });
});

test('the repository lists every Meet route handler', () => {
  assert.deepEqual(findUnlistedMeetRoutes(), []);
});
