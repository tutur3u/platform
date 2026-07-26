const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  findRegisteringProviderUsages,
  findViolations,
  servesOfflineWorker,
} = require('./check-offline-worker-wiring.js');

function createTempRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'offline-worker-wiring-'));
}

function writeFile(root, relativePath, content) {
  const fullPath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

const LAYOUT = (providerTag) => `
  export default function RootLayout({ children }) {
    return (
      <html>
        <body>
          ${providerTag}
            {children}
          </OfflineProvider>
        </body>
      </html>
    );
  }
`;

test('detects provider usages that leave registration enabled', () => {
  assert.equal(findRegisteringProviderUsages('<OfflineProvider>').length, 1);
  assert.equal(
    findRegisteringProviderUsages('<OfflineProvider register={false}>').length,
    0
  );
  assert.equal(
    findRegisteringProviderUsages(
      '<OfflineProvider reloadOnOnline register={false}>'
    ).length,
    0
  );
  // The deprecated alias registers the same worker.
  assert.equal(findRegisteringProviderUsages('<SerwistProvider>').length, 1);
});

test('flags an app that registers a worker it does not serve', () => {
  const root = createTempRepo();
  writeFile(
    root,
    'apps/tasks/src/app/[locale]/layout.tsx',
    LAYOUT('<OfflineProvider>')
  );

  assert.deepEqual(findViolations(root), [
    path.join('apps', 'tasks', 'src', 'app', '[locale]', 'layout.tsx'),
  ]);
});

test('accepts an app that opts out of registration', () => {
  const root = createTempRepo();
  writeFile(
    root,
    'apps/tasks/src/app/[locale]/layout.tsx',
    LAYOUT('<OfflineProvider register={false}>')
  );

  assert.deepEqual(findViolations(root), []);
});

test('accepts an app that serves the worker route', () => {
  const root = createTempRepo();
  writeFile(
    root,
    'apps/web/src/app/[locale]/layout.tsx',
    LAYOUT('<OfflineProvider>')
  );
  writeFile(
    root,
    'apps/web/src/app/serwist/[path]/route.ts',
    'export const GET = () => new Response();'
  );

  assert.equal(servesOfflineWorker(path.join(root, 'apps/web')), true);
  assert.deepEqual(findViolations(root), []);
});

test('the repository itself satisfies the rule', () => {
  assert.deepEqual(findViolations(), []);
});
