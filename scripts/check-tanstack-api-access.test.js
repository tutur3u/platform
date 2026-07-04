const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  findTanstackApiAccessViolations,
  formatViolations,
  scanSource,
  walkSourceFiles,
} = require('./check-tanstack-api-access.js');

function createTempRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tanstack-api-access-'));
}

function writeFile(root, relativePath, source) {
  const fullPath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, source);
}

test('current TanStack source has no protected raw API or Supabase access', () => {
  assert.deepEqual(findTanstackApiAccessViolations(), []);
});

test('walkSourceFiles ignores tests and generated route tree', () => {
  const root = createTempRepo();

  writeFile(root, 'apps/tanstack-web/src/routes/index.tsx', 'export {}');
  writeFile(root, 'apps/tanstack-web/src/routes/index.test.tsx', 'export {}');
  writeFile(root, 'apps/tanstack-web/src/routeTree.gen.ts', 'export {}');

  assert.deepEqual(walkSourceFiles(root), [
    path.join('apps', 'tanstack-web', 'src', 'routes', 'index.tsx'),
  ]);
});

test('allows public external fetches in TanStack components', () => {
  const source = `
    export async function loadContributors(path) {
      return fetch(\`https://api.github.com\${path}\`, {
        headers: { Accept: 'application/vnd.github+json' },
      });
    }
  `;

  assert.deepEqual(scanSource(source, 'apps/tanstack-web/src/github.ts'), []);
});

test('flags raw relative protected API fetches', () => {
  const source = `
    export async function submit() {
      return fetch('/api/v1/inquiries', {
        method: 'POST',
      });
    }
  `;

  const violations = scanSource(
    source,
    'apps/tanstack-web/src/components/contact.tsx'
  );

  assert.equal(violations.length, 1);
  assert.match(violations[0].message, /internal-api/);
  assert.equal(violations[0].line, 3);
});

test('flags raw relative protected API request wrappers', () => {
  const source = `
    export function makeRequest() {
      return fetch(new Request('/internal/jobs/reindex', { method: 'POST' }));
    }
  `;

  assert.equal(
    scanSource(source, 'apps/tanstack-web/src/routes/admin.tsx').length,
    1
  );
});

test('flags raw relative protected API axios calls', () => {
  const source = `
    import axios from 'axios';
    export function poll() {
      return axios.get('/api/migration/status');
    }
  `;

  assert.equal(
    scanSource(source, 'apps/tanstack-web/src/routes/status.tsx').length,
    1
  );
});

test('flags Supabase imports and client usage in TanStack code', () => {
  const source = `
    import { createClient } from '@tuturuuu/supabase/next/server';
    export async function load() {
      const supabase = createClient();
      return supabase.from('profiles').select('*');
    }
  `;

  const messages = scanSource(
    source,
    'apps/tanstack-web/src/routes/profiles.tsx'
  ).map((violation) => violation.message);

  assert.ok(messages.some((message) => /import Supabase/u.test(message)));
  assert.ok(
    messages.some((message) => /create or use Supabase/u.test(message))
  );
});

test('formats violations with file, line, and column', () => {
  const text = formatViolations([
    {
      column: 9,
      filePath: 'apps/tanstack-web/src/routes/example.tsx',
      line: 4,
      message: 'Use a facade.',
    },
  ]);

  assert.equal(
    text,
    'apps/tanstack-web/src/routes/example.tsx:4:9: Use a facade.'
  );
});

test('findTanstackApiAccessViolations scans a temp repo', () => {
  const root = createTempRepo();

  writeFile(
    root,
    'apps/tanstack-web/src/routes/contact.tsx',
    `export function action() { return fetch('/api/v1/inquiries'); }`
  );
  writeFile(
    root,
    'apps/tanstack-web/src/routes/contact.test.tsx',
    `export function action() { return fetch('/api/v1/inquiries'); }`
  );
  writeFile(
    root,
    'packages/internal-api/src/inquiries.ts',
    `export function submit(client) { return client.fetch('/api/v1/inquiries'); }`
  );

  const violations = findTanstackApiAccessViolations(root);

  assert.deepEqual(
    violations.map((violation) => violation.filePath),
    [path.join('apps', 'tanstack-web', 'src', 'routes', 'contact.tsx')]
  );
});
