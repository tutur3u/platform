const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  classifyDiagnostics,
  missingDistPackages,
  typeCheckProjects,
} = require('./type-check.js');

test('typeCheckProjects follows script chains and checker flags', () => {
  assert.deepEqual(
    typeCheckProjects('apps/calendar', {
      'type-check': 'bun run type-check:app && bun run type-check:worker',
      'type-check:app': 'tsc --noEmit --project tsconfig.json',
      'type-check:worker': 'tsc --noEmit -p tsconfig.worker.json',
    }),
    ['apps/calendar/tsconfig.json', 'apps/calendar/tsconfig.worker.json']
  );
  assert.deepEqual(
    typeCheckProjects('apps/web', {
      'type-check': 'node ../../scripts/run-tsc-build.js --build',
    }),
    ['apps/web/tsconfig.json']
  );
  assert.deepEqual(
    typeCheckProjects('packages/types', {
      'type-check': 'tsc --project tsconfig.build.json',
    }),
    ['packages/types/tsconfig.build.json']
  );
  assert.deepEqual(typeCheckProjects('packages/x', { lint: 'biome' }), []);
  assert.deepEqual(
    typeCheckProjects('packages/x', { 'type-check': 'vue-tsc --noEmit' }),
    []
  );
});

function tempRepo(packages) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'check-changed-'));
  for (const [dir, manifest, built] of packages) {
    const packageDir = path.join(root, 'packages', dir);
    fs.mkdirSync(packageDir, { recursive: true });
    fs.writeFileSync(
      path.join(packageDir, 'package.json'),
      JSON.stringify(manifest)
    );
    if (built) {
      fs.mkdirSync(path.join(packageDir, 'dist'), { recursive: true });
      fs.writeFileSync(path.join(packageDir, 'dist/index.d.ts'), '');
    }
  }
  return root;
}

test('missingDistPackages reports only unbuilt dist-typed packages', () => {
  const root = tempRepo([
    ['types', { name: '@tuturuuu/types', types: './dist/index.d.ts' }, false],
    [
      'supabase',
      {
        name: '@tuturuuu/supabase',
        exports: { '.': { types: './dist/index.d.ts' } },
      },
      true,
    ],
    ['icons', { name: '@tuturuuu/icons', types: './src/index.ts' }, false],
  ]);
  assert.deepEqual(
    [...missingDistPackages(root)],
    [['@tuturuuu/types', 'packages/types']]
  );
});

const diagnostic = (file, code, message = 'problem') => ({
  file,
  line: 1,
  column: 1,
  category: 'error',
  code,
  message,
});

test('warm declarations make every diagnostic blocking', () => {
  const diagnostics = [diagnostic('apps/web/src/a.ts', 2322)];
  const result = classifyDiagnostics(diagnostics, {
    changedFiles: new Set(),
    missing: new Map(),
  });
  assert.equal(result.blocking.length, 1);
});

test('cold declarations ignore missing-module noise and soften cascades', () => {
  const missing = new Map([['@tuturuuu/types', 'packages/types']]);
  const changedFiles = new Set([
    'apps/web/src/changed.ts',
    'apps/web/src/b.ts',
  ]);
  const diagnostics = [
    diagnostic(
      'apps/web/src/b.ts',
      2307,
      "Cannot find module '@tuturuuu/types/primitives/Task' or its corresponding type declarations."
    ),
    // Cascade inside a changed file that imports a missing package.
    diagnostic('apps/web/src/b.ts', 7006),
    // Real error in a changed file without missing imports.
    diagnostic('apps/web/src/changed.ts', 2322),
    // Error in an unchanged file: advisory while declarations are cold.
    diagnostic('apps/web/src/other.ts', 2339),
    // rootDir and other configuration diagnostics always block.
    diagnostic('packages/utils/src/x.test.ts', 6059),
    { ...diagnostic(null, 5023), line: null, column: null },
    // Missing modules outside the workspace set stay visible.
    diagnostic(
      'apps/web/src/changed.ts',
      2307,
      "Cannot find module 'left-pad' or its corresponding type declarations."
    ),
  ];
  const result = classifyDiagnostics(diagnostics, { changedFiles, missing });
  assert.deepEqual(
    result.ignored.map((entry) => entry.code),
    [2307]
  );
  assert.deepEqual(
    result.blocking.map((entry) => entry.code),
    [2322, 6059, 5023, 2307]
  );
  assert.deepEqual(
    result.advisory.map((entry) => entry.code),
    [7006, 2339]
  );
});
