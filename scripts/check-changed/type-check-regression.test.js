const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runChecker } = require('../ts-diagnostics.js');
const { classifyDiagnostics } = require('./type-check.js');

test('REV-6467-1: the compiler repro blocks TS2322 beside an unbuilt workspace import', (t) => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'changed-types-repro-')
  );
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(
    path.join(directory, 'index.ts'),
    "import type { Task } from '@tuturuuu/types';\nexport const value: number = 'invalid';\nexport let task: Task;\n"
  );
  fs.writeFileSync(
    path.join(directory, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        types: [],
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'bundler',
      },
      files: ['index.ts'],
    })
  );
  const result = runChecker(
    path.resolve(__dirname, '../../node_modules/.bin/tsc'),
    path.join(directory, 'tsconfig.json'),
    { timer: null }
  );
  const missing = result.diagnostics.find((entry) => entry.code === 2307);
  assert.ok(missing, result.output);
  assert.ok(result.diagnostics.some((entry) => entry.code === 2322));
  const groups = classifyDiagnostics(result.diagnostics, {
    changedFiles: new Set([missing.file]),
    missing: new Map([['@tuturuuu/types', 'packages/types']]),
  });
  assert.ok(groups.blocking.some((entry) => entry.code === 2322));
});
