const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runTypeCheck } = require('../check-changed.js');
const { classifyDiagnostics } = require('./type-check.js');
const { parseDiagnostics } = require('../ts-diagnostics.js');

const file = 'apps/web/src/changed.ts';
const other = 'apps/web/src/other.ts';
const missing = new Map([['@tuturuuu/internal-api', 'packages/internal-api']]);
const diagnostics = parseDiagnostics(
  [
    `${file}(1,24): error TS2307: Cannot find module '@tuturuuu/internal-api' or its corresponding type declarations.`,
    `${file}(8,20): error TS18046: 'result' is of type 'unknown'.`,
    // This value is unrelated to the import. Text output cannot prove causality.
    `${file}(12,5): error TS18046: 'unrelated' is of type 'unknown'.`,
    `${file}(14,5): error TS2322: Type 'string' is not assignable to type 'number'.`,
    `${other}(3,5): error TS18046: 'other' is of type 'unknown'.`,
  ].join('\n')
);

test('same-file unknowns remain blocking with missing-import evidence, including unrelated values', () => {
  const groups = classifyDiagnostics(diagnostics, {
    changedFiles: new Set([file, other]),
    missing,
  });
  assert.deepEqual(groups.blocking, diagnostics.slice(1));
  assert.deepEqual(groups.ignored, [diagnostics[0]]);
  assert.deepEqual(groups.advisory, []);
  assert.deepEqual(groups.environmentGapCandidates, [
    { diagnostic: diagnostics[1], missingImports: [diagnostics[0]] },
    { diagnostic: diagnostics[2], missingImports: [diagnostics[0]] },
  ]);
});

test('warm declarations or absent same-file missing imports do not produce candidates', () => {
  const changedFiles = new Set([file, other]);
  const warm = classifyDiagnostics(diagnostics, {
    changedFiles,
    missing: new Map(),
  });
  assert.deepEqual(warm.blocking, diagnostics);
  assert.deepEqual(warm.environmentGapCandidates, []);
  const withoutMissing = classifyDiagnostics(diagnostics.slice(1), {
    changedFiles,
    missing,
  });
  assert.deepEqual(withoutMissing.blocking, diagnostics.slice(1));
  assert.deepEqual(withoutMissing.environmentGapCandidates, []);
});

test('type-check reports candidates separately without declaring a false green', (t) => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'changed-environment-gap-')
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'apps/web'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'apps/web/package.json'),
    JSON.stringify({
      scripts: { 'type-check': 'tsc -p tsconfig.json' },
    })
  );
  fs.writeFileSync(path.join(root, 'apps/web/tsconfig.json'), '{}');
  const result = runTypeCheck(
    { typeCheck: { workspace: 'apps/web' } },
    {
      root,
      env: {},
      checker: 'tsc',
      checkers: { tsc: ['tsc'], tsrs: null },
      changedFiles: new Set([file, other]),
      missing,
      spawn: () => ({
        status: 2,
        stdout: diagnostics
          .map(
            (entry) =>
              `${entry.file}(${entry.line},${entry.column}): error TS${entry.code}: ${entry.message}`
          )
          .join('\n'),
      }),
    }
  );
  assert.equal(result.status, 'fail');
  assert.match(
    result.detail,
    /2 environment-gap candidate\(s\), still blocking/
  );
  assert.match(
    result.output,
    /Environment-gap candidates \(still blocking; causality unverified\):/
  );
  assert.match(result.output, /Same-file missing declaration:.*TS2307/);
  assert.match(
    result.output,
    /Build the missing workspace declarations and rerun/
  );
  for (const entry of diagnostics.slice(1)) {
    assert.ok(result.output.includes(`TS${entry.code}: ${entry.message}`));
  }
  const [ordinary, candidates] = result.output.split(
    'Environment-gap candidates'
  );
  assert.match(ordinary, /TS2322/);
  assert.match(ordinary, /'other' is of type 'unknown'/);
  assert.doesNotMatch(ordinary, /'unrelated'/);
  assert.match(candidates, /'unrelated' is of type 'unknown'/);
});
