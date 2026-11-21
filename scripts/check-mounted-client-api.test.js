const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  collectViolations,
  loadAllowlist,
  loadPatterns,
  violationsInSource,
} = require('./check-mounted-client-api.js');

const root = path.resolve(__dirname, '..');
const allowlist = loadAllowlist(root);
const patterns = {
  learn: loadPatterns(root, 'learn'),
  teach: loadPatterns(root, 'teach'),
  nova: loadPatterns(root, 'nova'),
  admin: loadPatterns(root, 'admin'),
};

function hits(app, source) {
  return violationsInSource(source, app, allowlist, patterns[app]);
}

test('an owned raw fetch fails and mountedFetch passes', () => {
  const raw =
    "fetch('/api/v1/vocabulary/pronunciation', { method: 'POST' });\n";
  const found = hits('learn', raw);
  assert.equal(found.length, 1);
  assert.match(found[0].message, /app-owned/);
  assert.deepEqual(hits('learn', raw.replace('fetch(', 'mountedFetch(')), []);
});

test('a verified Web passthrough may stay a raw fetch', () => {
  assert.deepEqual(
    hits('learn', "fetch('/api/ai/chat/new', { method: 'POST' });\n"),
    []
  );
  assert.deepEqual(
    hits('nova', "fetch('/api/v1/users/me/profile', { method: 'PATCH' });\n"),
    []
  );
  assert.deepEqual(
    hits(
      'nova',
      'fetch(`/api/workspaces/${ws.id}/accept-invite`, { method: "POST" });\n'
    ),
    []
  );
  assert.deepEqual(
    hits('admin', "fetch('/api/workspaces/invitations');\n"),
    []
  );
});

test('an ownerless raw fetch is not treated as a Web passthrough', () => {
  const found = hits(
    'nova',
    'fetch(`/api/v1/problems/${problemId}/prompt`);\n'
  );
  assert.equal(found.length, 1);
  assert.match(found[0].message, /not an allowlisted Web passthrough/);
});

test('api transport props and identifier fetches are covered', () => {
  assert.equal(
    hits('learn', "const transport = { api: '/api/v1/vocabulary/speech' };\n")
      .length,
    1
  );
  assert.deepEqual(
    hits(
      'learn',
      "const transport = { api: appApiPath('/api/v1/vocabulary/speech') };\n"
    ),
    []
  );
  const viaIdent = [
    "const url = '/api/v1/vocabulary/speech';",
    'fetch(url, { method: "POST" });',
  ].join('\n');
  assert.equal(hits('learn', viaIdent).length, 1);
  assert.deepEqual(
    hits('learn', viaIdent.replace('fetch(url', 'mountedFetch(url')),
    []
  );
});

test('an owned raw href fails and appApiPath passes', () => {
  const logout = hits('teach', '<a href="/api/auth/logout">out</a>\n');
  assert.equal(logout.length, 1);
  assert.match(logout[0].message, /href/);
  assert.match(logout[0].message, /app-owned/);
  assert.deepEqual(
    hits('teach', "<a href={appApiPath('/api/auth/logout')}>out</a>\n"),
    []
  );
  const download = hits(
    'admin',
    '<a href={`/api/parley/references/${r.id}`}>file</a>\n'
  );
  assert.equal(download.length, 1);
  assert.match(download[0].message, /app-owned/);
  assert.deepEqual(
    hits(
      'admin',
      '<a href={appApiPath(`/api/parley/references/${r.id}`)}>file</a>\n'
    ),
    []
  );
});

test('an allowlisted Web href may stay raw', () => {
  assert.deepEqual(hits('learn', '<a href="/api/ai/chat">chat</a>\n'), []);
});

test('resolver and comment forms are ignored', () => {
  assert.deepEqual(
    hits(
      'learn',
      "internalApiClient.fetch('/api/v1/vocabulary/speech');\n// fetch('/api/v1/vocabulary/speech')\n"
    ),
    []
  );
  assert.equal(
    hits(
      'learn',
      "const response = await fetch(\n  '/api/v1/vocabulary/speech',\n);\n"
    ).length,
    1
  );
});

test('the client trees have no raw /api calls outside the allowlist', () => {
  assert.deepEqual(collectViolations({ rootDir: root }), []);
});
