import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { unifiedDiff } from './diff.mjs';
import { VERCEL_WORKFLOW } from './fixture-repo.mjs';
import {
  addBiomeRouteTreeIgnore,
  addCiWorkflow,
  addHeldRecord,
  addPackageScripts,
  addPolicyTestApp,
  addProtectedSurface,
  addVercelProductionPolicyGate,
  dependencyCommands,
} from './repo-edits.mjs';

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const real = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

// Real files: a refactor that moves an anchor must fail here, not silently.
// The app id is one no branch converts, so applied conversions don't mask it.
const PROBE = 'codemod-probe';
// Any real per-app Vercel publisher that has no policy gate yet.
const UNGATED_PUBLISHER = fs
  .readdirSync(path.join(ROOT, '.github/workflows'))
  .filter((name) => /^vercel-production-[a-z-]+\.yaml$/u.test(name))
  .sort()
  .find(
    (name) => !real(`.github/workflows/${name}`).includes('production-policy:')
  );
const EDITS = [
  ['tuturuuu.ci.ts', (source) => addHeldRecord(source, PROBE)],
  [
    'tuturuuu.ci.ts',
    (source) => addCiWorkflow(source, `${PROBE}-cloudflare.yaml`),
  ],
  [
    'scripts/ci/production-publication-policy.ts',
    (source) => addProtectedSurface(source, PROBE),
  ],
  [
    'scripts/ci/production-publication-policy.test.js',
    (source) => addPolicyTestApp(source, PROBE),
  ],
  ['biome.json', (source) => addBiomeRouteTreeIgnore(source, PROBE)],
  [
    `.github/workflows/${UNGATED_PUBLISHER}`,
    (source) =>
      addVercelProductionPolicyGate(
        source,
        UNGATED_PUBLISHER.replace(/^vercel-production-|\.yaml$/gu, '')
      ),
  ],
];
for (const [file, edit] of EDITS) {
  test(`${file}: edit applies once against the real anchor`, () => {
    const source = real(file);
    const once = edit(source);
    assert.notEqual(once, source);
    assert.equal(edit(once), once);
  });
}

test('held record and protected surface land inside their objects', () => {
  const ci = addHeldRecord(real('tuturuuu.ci.ts'), PROBE);
  assert.match(
    ci,
    /\n {2}'codemod-probe': \{ state: 'held', reason: 'held for wave-2 cutover' \},\n\} satisfies ProductionPublicationPolicy;/
  );
  const surfaces = addProtectedSurface(
    real('scripts/ci/production-publication-policy.ts'),
    PROBE
  );
  assert.match(
    surfaces,
    /\n {2}'codemod-probe': \['frontend'\],\n\} as const;/
  );
  const biome = JSON.parse(addBiomeRouteTreeIgnore(real('biome.json'), PROBE));
  assert.ok(
    biome.files.includes.includes('!apps/codemod-probe/src/routeTree.gen.ts')
  );
});

test('anchors that disappear fail loudly', () => {
  assert.throws(
    () => addHeldRecord('export const ci = {\n};\n', 'tools'),
    /productionPublicationPolicy/
  );
  assert.throws(() => addProtectedSurface('', 'tools'), /protectedSurfaces/);
  assert.throws(() => addPolicyTestApp('', 'tools'), /held app list/);
  assert.throws(() => addBiomeRouteTreeIgnore('{}', 'tools'), /anchor missing/);
});

test('a long held-app list wraps to one entry per line', () => {
  const source =
    "const apps = ['meet', 'calendar', 'mail', 'apps', 'shortener', 'tools', 'chat'];";
  assert.equal(
    addPolicyTestApp(source, 'playground'),
    "const apps = [\n  'meet',\n  'calendar',\n  'mail',\n  'apps',\n  'shortener',\n  'tools',\n  'chat',\n  'playground',\n];"
  );
});

test('package scripts are added but never overwritten', () => {
  const source = `${JSON.stringify({ scripts: { build: 'next build', 'build:cloudflare': 'other' } }, null, 2)}\n`;
  const result = addPackageScripts(source, {
    build: 'next build',
    'build:cloudflare': 'vp build',
    'dev:cloudflare': 'vp dev',
  });
  assert.deepEqual(JSON.parse(result.source).scripts, {
    build: 'next build',
    'build:cloudflare': 'other',
    'dev:cloudflare': 'vp dev',
  });
  assert.deepEqual(result.conflicts, [
    'build:cloudflare: keeps "other" (codemod wants "vp build")',
  ]);
  assert.equal(
    addPackageScripts(result.source, { 'dev:cloudflare': 'vp dev' }).source,
    result.source
  );
});

test('dependency commands cover only missing or differently pinned packages', () => {
  const source = JSON.stringify({
    dependencies: { a: '1.0.0' },
    devDependencies: { b: '2.0.0' },
  });
  assert.deepEqual(
    dependencyCommands(source, {
      dependencies: { a: '1.0.0', c: '3.0.0' },
      devDependencies: { b: '2.0.1' },
    }),
    [
      ['bun', 'add', '--exact', 'c@3.0.0'],
      ['bun', 'add', '--dev', '--exact', 'b@2.0.1'],
    ]
  );
  assert.deepEqual(
    dependencyCommands(source, { dependencies: { a: '1.0.0' } }),
    []
  );
});

test('unified diff reports creations and in-place changes', () => {
  assert.equal(unifiedDiff('x', 'a\n', 'a\n'), '');
  assert.equal(
    unifiedDiff('x', null, 'a\nb\n'),
    '--- /dev/null\n+++ b/x\n@@ -0,0 +1,2 @@\n+a\n+b\n'
  );
  assert.equal(
    unifiedDiff(
      'x',
      '1\n2\n3\n4\n5\n6\n7\n8\n9\n',
      '1\n2\n3\n4\nfive\n6\n7\n8\n9\n'
    ),
    '--- a/x\n+++ b/x\n@@ -2,7 +2,7 @@\n 2\n 3\n 4\n-5\n+five\n 6\n 7\n 8\n'
  );
});

test('the Vercel publisher gains the shared policy gate before deploying', () => {
  const gated = addVercelProductionPolicyGate(VERCEL_WORKFLOW, 'demo');
  assert.match(
    gated,
    /\n {2}production-policy:\n[\s\S]*run: node scripts\/ci\/production-publication-policy\.ts vercel-production-demo\.yaml "\$GITHUB_STEP_SUMMARY"\n\n {2}Deploy-Production:\n {4}needs: \[production-policy\]\n {4}if: github\.ref == 'refs\/heads\/production' && needs\.production-policy\.outputs\.allowed == 'true'\n {4}environment: vercel-production-demo\n/u
  );
  assert.equal(addVercelProductionPolicyGate(gated, 'demo'), gated);
  assert.throws(
    () =>
      addVercelProductionPolicyGate(
        'jobs:\n  Deploy-Production:\n    runs-on: x\n',
        'demo'
      ),
    /production-only if/
  );
});
