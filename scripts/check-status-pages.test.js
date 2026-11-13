const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { appProblems, statusPageCoverage } = require('./check-status-pages.js');

test('every user-facing app uses the shared status page', () => {
  const failing = statusPageCoverage().filter((row) => row.problems.length);
  assert.deepEqual(failing, []);
});

test('a bare TanStack 404 and an unstyled Next app are reported', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'status-pages-'));
  const write = (rel, text) => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  };
  write(
    'src/routes/__root.tsx',
    'createRootRoute({ notFoundComponent: () => (<main><h1>404</h1></main>) })'
  );
  write('src/app/[locale]/layout.tsx', 'export default function L() {}');
  write(
    'src/app/[locale]/error.tsx',
    '<AppErrorBoundary appName="X" error={error} reset={reset} />'
  );
  assert.deepEqual(appProblems(dir), [
    'bare 404 heading',
    'root error',
    'root not-found uses StatusPage',
    'root error uses the shared page',
    'src/app/[locale]/not-found.tsx uses StatusPage',
    'src/app/[locale]/error.tsx uses AppErrorBoundary chrome="page"',
    'src/app/global-error.tsx uses GlobalAppErrorBoundary',
  ]);
  fs.rmSync(dir, { recursive: true, force: true });
});
