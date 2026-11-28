// Reproduce the release fence's single-condition mutation proof without editing source.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: { out: { type: 'string' } } });
assert.ok(values.out, '--out is required');
const root = dirname(fileURLToPath(import.meta.url));
const moduleName = 'wave1-native-production-resolution.mjs';
const testName = 'wave1-native-production-resolution-predicates.test.mjs';
const source = readFileSync(join(root, moduleName), 'utf8');
const resolvedRunIds = [
  ...new Set(
    JSON.parse(
      readFileSync(
        join(root, 'wave1-native-production-resolutions.json'),
        'utf8'
      )
    ).map((record) => record.runId)
  ),
];
const start = source.indexOf(
  '  return (',
  source.indexOf('export function matchesFailedNoWriteResolution')
);
const end = source.indexOf('\n  );', start);
assert.ok(start > 0 && end > start);
const predicates = source
  .slice(start + '  return ('.length, end)
  .trim()
  .split(/\s+&&\s+/u);
assert.equal(
  predicates.length,
  22,
  'Update the explicit mutation inventory when the fence changes'
);
const scratch = mkdtempSync(join(tmpdir(), 'wave1-fence-mutations-'));
try {
  for (const name of [
    testName,
    'wave1-native-production-resolutions.json',
    'wave1-production-deployments.mjs',
  ])
    cpSync(join(root, name), join(scratch, name));
  const runTest = (file) =>
    spawnSync(
      process.execPath,
      ['--test', '--test-reporter=tap', join(scratch, file)],
      {
        cwd: scratch,
        env: {
          HOME: scratch,
          TMPDIR: scratch,
          PATH: dirname(process.execPath),
        },
        timeout: 10000,
        maxBuffer: 1024 * 1024,
        encoding: 'utf8',
      }
    );
  const run = () => runTest(testName);
  writeFileSync(join(scratch, moduleName), source);
  const baseline = run();
  assert.equal(
    baseline.status,
    0,
    'Unmodified predicate tests must pass before mutation'
  );
  const rows = [];
  for (const [index, predicate] of predicates.entries()) {
    const replacement = predicates
      .map((part, i) => (i === index ? 'true' : part))
      .join(' &&\n    ');
    writeFileSync(
      join(scratch, moduleName),
      `${source.slice(0, start)}  return (\n    ${replacement}${source.slice(end)}`
    );
    const result = run();
    assert.equal(
      result.error,
      undefined,
      'Mutation subprocess infrastructure failed'
    );
    const failures = [...result.stdout.matchAll(/^not ok \d+ - (.+)$/gmu)].map(
      (m) => m[1]
    );
    const expected = `predicate ${String(index + 1).padStart(2, '0')}:`;
    for (const runId of resolvedRunIds)
      assert.ok(
        result.status !== 0 &&
          failures.some(
            (name) => name.startsWith(expected) && name.endsWith(`(${runId})`)
          ),
        `Mutation ${index + 1} survived for resolved run ${runId}: ${predicate}`
      );
    rows.push({
      predicate: index + 1,
      expression: predicate.replace(/\s+/gu, ' '),
      result: 'killed',
      matchedEntries: resolvedRunIds,
      failedTests: failures,
    });
  }
  // Neutralizing the hosted-version guard must be caught by its own predicate-suite tests.
  const guardStart = source.indexOf(
    'export function assertResolvedVersionsAbsent'
  );
  assert.ok(guardStart > 0, 'assertResolvedVersionsAbsent must exist');
  writeFileSync(
    join(scratch, moduleName),
    `${source.slice(0, guardStart)}export function assertResolvedVersionsAbsent() {}\n`
  );
  const guard = run();
  const guardFailures = [
    ...guard.stdout.matchAll(/^not ok \d+ - (.+)$/gmu),
  ].map((m) => m[1]);
  assert.ok(
    guard.status !== 0 &&
      guardFailures.some((name) =>
        name.startsWith('hosted version carrying a resolved')
      ),
    'Mutation: neutralized assertResolvedVersionsAbsent survived'
  );
  rows.push({
    guard: 'assertResolvedVersionsAbsent neutralized',
    result: 'killed',
    failedTests: guardFailures,
  });
  const rawUuidSource = source.replaceAll('canonicalDeploymentId(', '(');
  writeFileSync(join(scratch, moduleName), rawUuidSource);
  const rawUuidResult = run();
  assert.match(
    rawUuidResult.stdout,
    /^not ok .*R8: receipt and live baselines/mu
  );
  rows.push({ guard: 'R8 raw baseline UUID comparison', result: 'killed' });
  writeFileSync(join(scratch, moduleName), source);

  // Guard mutants for F1 (complete version inventory pagination) and F2 (pre-upload live rollback check).
  const guardsModule = 'wave1-native-production-guards.mjs';
  const guardsTest = 'wave1-native-production-guards.test.mjs';
  const deploymentHistoryTest =
    'wave1-native-production-deployment-history.test.mjs';
  const modelTest = 'wave1-native-production-guards-model.test.mjs';
  const guardsSource = readFileSync(join(root, guardsModule), 'utf8');
  for (const name of [
    guardsModule,
    guardsTest,
    modelTest,
    deploymentHistoryTest,
    'wave1-production-deployments.mjs',
  ])
    cpSync(join(root, name), join(scratch, name));
  const guardsBaseline = runTest(guardsTest);
  assert.equal(
    guardsBaseline.status,
    0,
    'Unmodified guard tests must pass before mutation'
  );
  const modelBaseline = runTest(modelTest);
  assert.equal(
    modelBaseline.status,
    0,
    'Unmodified model-based guard tests must pass before mutation'
  );

  // F1 mutant: discard pagination metadata and return only the first page.
  const k2Start = guardsSource.indexOf(
    'export function assertActiveVersionsPresent'
  );
  assert.ok(k2Start > 0, 'assertActiveVersionsPresent must exist');
  const f2Start = guardsSource.indexOf(
    'export async function assertLiveRollbackUnchanged'
  );
  assert.ok(f2Start > 0, 'assertLiveRollbackUnchanged must exist');
  writeFileSync(
    join(scratch, guardsModule),
    `import assert from 'node:assert/strict';\nimport { canonicalDeploymentId, sameSplit } from './wave1-production-deployments.mjs';\nconst VERSION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;\nexport async function readAllVersions({ script, token, fetchJson }) {\n  const response = await fetchJson(\`\${script}/versions?per_page=100\`, token);\n  return response.result.items;\n}\n${guardsSource.slice(k2Start)}`
  );
  const f1Result = runTest(guardsTest);
  const f1Failures = [
    ...f1Result.stdout.matchAll(/^not ok \d+ - (.+)$/gmu),
  ].map((m) => m[1]);
  assert.ok(
    f1Result.status !== 0 && f1Failures.some((name) => name.startsWith('F1:')),
    'Mutation: neutralized F1 readAllVersions pagination survived'
  );
  rows.push({
    guard: 'F1 readAllVersions pagination neutralized',
    result: 'killed',
    failedTests: f1Failures,
  });

  // H1/H2/H3 mutants in readAllVersions: reintroducing early return on null cursor,
  // dropping contradictory-totals/per_page refusals, and allowing missing item.id.
  for (const [label, expectedPrefix, mutator] of [
    [
      'H1 early return on null/empty cursor reintroduced',
      'H1:',
      (s) =>
        s.replace(
          "paginationMode = 'page';",
          "if (Object.hasOwn(info, 'cursor') && nextCursor === null) return items;\n    paginationMode = 'page';"
        ),
    ],
    [
      'H2 contradictory total_pages and per_page refusals removed',
      'H2:',
      (s) =>
        s
          .replace(
            "assert.ok(\n        pageItems.length <= info.per_page,\n        'Version inventory page exceeds per_page'\n      );",
            '/* mutated */'
          )
          .replace(
            "if (expectedTotalPages !== null && pageItems.length > 0)\n      assert.ok(\n        page <= expectedTotalPages,\n        'Contradictory version inventory: non-empty page beyond total_pages'\n      );",
            '/* mutated */'
          ),
    ],
    [
      'H3 missing item.id check removed',
      'H3:',
      (s) =>
        s.replace(
          "assert.match(item.id ?? '', VERSION_ID_RE);",
          '/* mutated */'
        ),
    ],
    [
      'J1 empty page strictly-beyond total_pages weakened to >=',
      'J1:',
      (s) =>
        s.replace('page > expectedTotalPages,', 'page >= expectedTotalPages,'),
    ],
    [
      'J2 UUID 8-4-4-4-12 regex weakened to [a-f0-9-]{36}',
      'J2:',
      (s) =>
        s.replace(
          "assert.match(item.id ?? '', VERSION_ID_RE);",
          "assert.match(item.id ?? '', /^[a-f0-9-]{36}$/);"
        ),
    ],
    [
      'J4 strict <100 version bound weakened to <=100',
      'J4:',
      (s) =>
        s.replace(
          'items.length < maxVersions,',
          'items.length <= maxVersions,'
        ),
    ],
    [
      'K1 empty page after advertised continuation check removed',
      'K1:',
      (s) => s.replace('!continuationAdvertised,', 'true ||'),
    ],
  ]) {
    const mutated = mutator(guardsSource);
    assert.notEqual(
      mutated,
      guardsSource,
      `Guard mutator had no effect: ${label}`
    );
    writeFileSync(join(scratch, guardsModule), mutated);
    const res = runTest(guardsTest);
    const failed = [...res.stdout.matchAll(/^not ok \d+ - (.+)$/gmu)].map(
      (m) => m[1]
    );
    assert.ok(
      res.status !== 0 &&
        failed.some((name) => name.startsWith(expectedPrefix)),
      `Mutation survived: ${label}`
    );
    rows.push({ guard: label, result: 'killed', failedTests: failed });
  }

  // F2 mutant: neutralize the pre-upload live deployment check.
  writeFileSync(
    join(scratch, guardsModule),
    `${guardsSource.slice(0, f2Start)}export async function assertLiveRollbackUnchanged() {}\n`
  );
  const f2Result = runTest(guardsTest);
  const f2Failures = [
    ...f2Result.stdout.matchAll(/^not ok \d+ - (.+)$/gmu),
  ].map((m) => m[1]);
  assert.ok(
    f2Result.status !== 0 && f2Failures.some((name) => name.startsWith('F2:')),
    'Mutation: neutralized F2 assertLiveRollbackUnchanged survived'
  );
  rows.push({
    guard: 'F2 assertLiveRollbackUnchanged neutralized',
    result: 'killed',
    failedTests: f2Failures,
  });

  // K2, R6-2, and R6-3 guard mutants killed by modelTest.
  for (const [label, expectedPrefix, mutator] of [
    [
      'R8 raw live deployment UUID comparison',
      'R8:',
      (s) => s.replace('canonicalDeploymentId(expected?.id)', 'expected?.id'),
    ],
    [
      'R8 deployment traversal stops on first page',
      'R8:',
      (s) =>
        s.replace(
          '    const pageItems = rawItems ?? [];',
          "    if (resource === 'deployments') return rawItems;\n    const pageItems = rawItems ?? [];"
        ),
    ],
    [
      'R8 missing historical detail accepted without confirmation',
      'R8:',
      (s) => s.replace('await isVersionMissing(id)', 'true'),
    ],
    [
      'K2 assertActiveVersionsPresent membership check removed',
      'K2:',
      (s) => s.replace('observedIds.has(id) ||', 'true ||'),
    ],
    [
      'R6-2 UUID case-canonicalization removed in readAllVersions',
      'R6-2:',
      (s) =>
        s.replace(
          'const canonicalId = canonicalDeploymentId(item.id);',
          'const canonicalId = item.id;'
        ),
    ],
    [
      'R6-2 UUID case-canonicalization removed in assertActiveVersionsPresent',
      'R6-2:',
      (s) =>
        s.replace(
          '.map((item) => canonicalDeploymentId(item.id))',
          '.map((item) => item.id)'
        ),
    ],
    [
      'R6-3 full deployments history check narrowed to active-only',
      'R6-3:',
      (s) => s.replace('index < deployments.length;', 'index < 1;'),
    ],
  ]) {
    const mutated = mutator(guardsSource);
    assert.notEqual(mutated, guardsSource, `Mutator had no effect: ${label}`);
    writeFileSync(join(scratch, guardsModule), mutated);
    const res = runTest(
      expectedPrefix === 'R8:' ? deploymentHistoryTest : modelTest
    );
    const failed = [...res.stdout.matchAll(/^not ok \d+ - (.+)$/gmu)].map(
      (m) => m[1]
    );
    assert.ok(
      res.status !== 0 &&
        failed.some((name) => name.startsWith(expectedPrefix)),
      `Mutation survived: ${label}`
    );
    rows.push({ guard: label, result: 'killed', failedTests: failed });
  }

  // Model-based invariant mutant: return early on a short non-empty page without empty-page proof.
  const modelMutated = guardsSource.replace(
    'if (pageItems.length === 0) {',
    'if (pageItems.length < 100) return items;\n    if (pageItems.length === 0) {'
  );
  assert.notEqual(
    modelMutated,
    guardsSource,
    'Model-based mutator had no effect'
  );
  writeFileSync(join(scratch, guardsModule), modelMutated);
  const modelResult = runTest(modelTest);
  const modelFailures = [
    ...modelResult.stdout.matchAll(/^not ok \d+ - (.+)$/gmu),
  ].map((m) => m[1]);
  assert.ok(
    modelResult.status !== 0 &&
      modelFailures.some((name) => name.startsWith('model-based:')),
    'Mutation: model-based invariant short-page early return survived'
  );
  rows.push({
    guard: 'model-based invariant: early return on short non-empty page',
    result: 'killed',
    failedTests: modelFailures,
  });
  writeFileSync(join(scratch, guardsModule), guardsSource);

  // Call-site mutants in wave1-native-production.mjs via an in-memory ESM load
  // hook so no tracked source file is modified on disk.
  const repoRoot = resolve(root, '../..');
  const prodPath = join(root, 'wave1-native-production.mjs');
  const prodSource = readFileSync(prodPath, 'utf8');
  const prodUrl = pathToFileURL(prodPath).href;
  const hookPath = join(scratch, 'callsite-hook.mjs');
  writeFileSync(
    hookPath,
    [
      "import { readFileSync } from 'node:fs';",
      "import { registerHooks } from 'node:module';",
      'const target = process.env.WAVE1_MUTATION_TARGET_URL;',
      "const replacement = readFileSync(process.env.WAVE1_MUTATION_SOURCE_FILE, 'utf8');",
      'registerHooks({',
      '  load(url, context, nextLoad) {',
      "    if (url === target) return { format: 'module', shortCircuit: true, source: replacement };",
      '    return nextLoad(url, context);',
      '  },',
      '});',
      '',
    ].join('\n')
  );
  const runCallsite = (testFile, pattern, mutatedSource) => {
    const mutatedPath = join(scratch, 'wave1-native-production.mutated.mjs');
    writeFileSync(mutatedPath, mutatedSource);
    return spawnSync(
      process.execPath,
      [
        '--import',
        pathToFileURL(hookPath).href,
        '--test',
        '--test-reporter=tap',
        ...(pattern ? [`--test-name-pattern=${pattern}`] : []),
        join(root, testFile),
      ],
      {
        cwd: repoRoot,
        env: {
          HOME: scratch,
          TMPDIR: scratch,
          PATH: dirname(process.execPath),
          WAVE1_MUTATION_TARGET_URL: prodUrl,
          WAVE1_MUTATION_SOURCE_FILE: mutatedPath,
        },
        timeout: 30000,
        maxBuffer: 2 * 1024 * 1024,
        encoding: 'utf8',
      }
    );
  };
  const callsiteBaseline = runCallsite(
    'wave1-native-production-fence.test.mjs',
    null,
    prodSource
  );
  assert.equal(
    callsiteBaseline.status,
    0,
    'Unmodified call-site fence tests must pass before mutation'
  );
  for (const [label, testFile, pattern, mutator] of [
    [
      'call-site historical exception enabled without approval',
      'wave1-native-production-fence.test.mjs',
      'R6-3:',
      (s) =>
        s.replace('approvedHistoricalVersionNotFoundCodes.get(app)', '100146'),
    ],
    [
      'call-site assertResolvedVersionsAbsent removed',
      'wave1-native-production.test.mjs',
      'resolved no-write SHA',
      (s) =>
        s.replace(
          'assertResolvedVersionsAbsent({ app, versions: observedVersions });',
          '/* mutated */'
        ),
    ],
    [
      'call-site F1 readAllVersions replaced with single-page read',
      'wave1-native-production-fence.test.mjs',
      'F1',
      (s) =>
        s.replace(
          /const versionItems = await readAllVersions\([\s\S]*?\);/u,
          'const versionItems = (await provider(`${script}/versions?per_page=100`)).items;'
        ),
    ],
    [
      'call-site K2 assertActiveVersionsPresent removed',
      'wave1-native-production-fence.test.mjs',
      'K2:',
      (s) =>
        s
          .replace(
            /assertActiveVersionsPresent\(\{\s*deployments: deployments\.slice\(0, 1\),\s*versionItems,\s*\}\);/u,
            '/* mutated */'
          )
          .replace(
            /assertActiveVersionsPresent\(\{\s*deployments,\s*versionItems,\s*confirmedMissingHistoricalIds,\s*\}\);/u,
            '/* mutated */'
          ),
    ],
    [
      'call-site F2 assertLiveRollbackUnchanged removed',
      'wave1-native-production-fence.test.mjs',
      'F2:',
      (s) =>
        s.replace(
          /await assertLiveRollbackUnchanged\([\s\S]*?\);/u,
          '/* mutated */'
        ),
    ],
  ]) {
    const mutated = mutator(prodSource);
    assert.notEqual(
      mutated,
      prodSource,
      `Call-site mutator had no effect: ${label}`
    );
    const res = runCallsite(testFile, pattern, mutated);
    assert.equal(
      res.error,
      undefined,
      `Call-site mutation subprocess failed: ${label}`
    );
    const failed = [...res.stdout.matchAll(/^not ok \d+ - (.+)$/gmu)].map(
      (m) => m[1]
    );
    assert.ok(
      res.status !== 0 && failed.length > 0,
      `Call-site mutation survived: ${label}`
    );
    rows.push({ guard: label, result: 'killed', failedTests: failed });
  }

  const report = {
    baseline: 'passed',
    total: rows.length,
    killed: rows.length,
    survivors: 0,
    rows,
  };
  writeFileSync(resolve(values.out), `${JSON.stringify(report, null, 2)}\n`, {
    mode: 0o600,
  });
  console.log(
    JSON.stringify({
      baseline: report.baseline,
      killed: report.killed,
      survivors: report.survivors,
      out: resolve(values.out),
    })
  );
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
