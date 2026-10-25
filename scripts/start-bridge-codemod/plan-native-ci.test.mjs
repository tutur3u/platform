// Split from plan.test.mjs (700-line ceiling): the generated native CI.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createFixtureRepo, fakeCodegen, writeTree } from './fixture-repo.mjs';
import { pendingWrites, planConversion } from './plan.mjs';

const plan = (root, options = {}) =>
  planConversion(root, 'demo', { codegen: fakeCodegen(), ...options });

test('native CI is a thin caller of the reusable template, once it exists', (t) => {
  const root = createFixtureRepo(t);
  assert.equal(
    pendingWrites(plan(root)).some((write) =>
      write.path.endsWith('demo-cloudflare.yaml')
    ),
    false
  );
  writeTree(root, {
    '.github/workflows/native-start-app.yaml': 'on: workflow_call\n',
    'packages/ui/package.json': JSON.stringify({
      name: '@tuturuuu/ui',
      dependencies: { '@tuturuuu/utils': 'workspace:*', react: '^19' },
    }),
    'packages/utils/package.json': JSON.stringify({ name: '@tuturuuu/utils' }),
    // Added by --apply's `bun add`, not yet in the app manifest.
    'packages/start-bridge/package.json': JSON.stringify({
      name: '@tuturuuu/start-bridge',
    }),
  });
  const manifestPath = path.join(root, 'apps/demo/package.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.dependencies['@tuturuuu/ui'] = 'workspace:*';
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const result = plan(root);
  const content = (file) =>
    result.writes.find((write) => write.path === file)?.content ?? '';
  const caller = content('.github/workflows/demo-cloudflare.yaml');
  for (const expected of [
    "'apps/demo/**',",
    "'packages/ui/**',",
    "'packages/utils/**',",
    // The first run already covers what the re-run sees after `bun add`.
    "'packages/start-bridge/**',",
    "'scripts/ci/demo-native-artifact.py',",
    "'.github/workflows/native-start-app.yaml',",
    'uses: ./.github/workflows/native-start-app.yaml',
    "package: '@tuturuuu/demo'",
    'artifact-script: scripts/ci/demo-native-artifact.py',
    'env-interface: DemoGeneratedEnv',
    'worker-environment-type: DemoEnvironment',
    'workflow_name: demo-cloudflare.yaml',
    'unit-command: bun x --no-install vitest run --passWithNoTests',
    'NEXT_PUBLIC_APP_URL=https://demo.tuturuuu.com',
  ])
    assert.ok(caller.includes(expected), expected);
  assert.match(
    content('scripts/ci/demo-native-artifact.py'),
    /WORKER = "tuturuuu-demo-vite-staging"[\s\S]*"favicon\.ico",[\s\S]*DEMO_SOURCE_SHA/
  );
  // Same-zone self-fetches reach the Worker, not the zone origin (Vercel):
  // the template, the sealed identity and the runtime check all carry it.
  const flags = '["nodejs_compat","global_fetch_strictly_public"]';
  assert.match(
    content('apps/demo/void.config.ts'),
    /compatibility_flags: \['nodejs_compat', 'global_fetch_strictly_public'\]/
  );
  const helper = content('scripts/ci/demo-native-artifact.py');
  assert.ok(helper.includes(`"compatibility_flags": ${flags},`));
  assert.ok(helper.includes('"compatibility_date": "2026-10-12",'));
  const python = spawnSync(
    'python3',
    ['-c', 'import ast,sys; ast.parse(sys.stdin.read())'],
    {
      input: helper,
      encoding: 'utf8',
    }
  );
  if (!python.error) assert.equal(python.status, 0, python.stderr);
  const runtime = content(
    'apps/demo/cloudflare/native-built-worker.runtime.mjs'
  );
  assert.match(runtime, /const WORKER = "tuturuuu-demo-vite-staging";/);
  assert.match(runtime, /build identity is the exact compiled source/);
  // Anonymous, exact source; a guarding proxy gets a direct remedy.
  assert.match(
    runtime,
    /const response = await get\('\/api\/build-info'\);\s*assert\.notEqual\(\s*response\.status,\s*401,\s*'app proxy must admit GET \/api\/build-info/
  );
  assert.match(runtime, /assert\.equal\(info\.commitHash, source\);/);
  assert.doesNotMatch(runtime, /build-info'[^)]*headers/);
  // A public root must answer 200, not merely "no 5xx" (a login redirect).
  assert.match(runtime, /^const EXPECTED = \{"\/":200\};$/m);
  // The mounts come from the same defaults as worker.ts plus the app-owned
  // config, so the root/apex expectations cannot drift from the Worker.
  const defaults = JSON.parse(
    /^const DEFAULT_MOUNTS = (.*);$/m.exec(runtime)?.[1] ?? 'null'
  );
  assert.deepEqual(defaults, {
    rootHosts: ['demo.tuturuuu.com'],
    mountHosts: ['tuturuuu.com'],
    basePath: '/demo',
  });
  const worker = content('apps/demo/cloudflare/worker.ts');
  assert.match(worker, /rootHosts: \['demo\.tuturuuu\.com'\],/);
  assert.match(worker, /mountHosts: \['tuturuuu\.com'\],/);
  assert.match(worker, /basePath: '\/demo',\n {6}\.\.\.appConfig\.mounts,/);
  assert.match(
    runtime,
    /pathToFileURL\(join\(app, 'start-bridge\.config\.ts'\)\)[\s\S]*const MOUNTS = \{ \.\.\.DEFAULT_MOUNTS, \.\.\.appConfig\.mounts \};/
  );
  // Raw Host headers on every probe: never fetch() against the dev origin.
  assert.match(runtime, /headers: \{ host \}/);
  assert.doesNotMatch(runtime, /fetch\(`\$\{origin\}/);
  assert.match(runtime, /const get = \(path\) => call\(path, ROOT_HOST\);/);
  assert.match(runtime, /for \(const host of MOUNTS\.rootHosts\)/);
  // Root-only: the bridge rejects the apex and unknown hosts, with no egress.
  assert.match(runtime, /must set mounts\.unknownHost to "reject"/);
  assert.match(runtime, /\['unknown-host\.invalid', '\/'\]/);
  assert.match(
    runtime,
    /assert\.equal\(response\.status, 404,[\s\S]*assert\.equal\(response\.body, 'Not Found',[\s\S]*assert\.equal\(egress\.length, before,/
  );
  assert.ok(
    runtime.includes(`assert.deepEqual(config.compatibility_flags, ${flags});`)
  );
  assert.match(
    runtime,
    /from '\.\.\/\.\.\/\.\.\/scripts\/start-bridge-codemod\/runtime-outcome\.mjs';/
  );
  assert.match(runtime, /runtimeExpectationProblems\(EXPECTED\), \[\]/);
  // Every declared page on the apex mount, with base-aware redirects.
  assert.match(
    runtime,
    /if \(MOUNTED\) \{[\s\S]*call\(mountedPath\(BASE, path\), APEX\)[\s\S]*origin: `http:\/\/\$\{APEX\}`,\s*base: BASE,/
  );
  assert.doesNotMatch(runtime, /root < 500|mounted < 500|statusFor/);
  assert.ok(
    content('.github/workflows/demo-cloudflare.yaml').includes(
      "'scripts/start-bridge-codemod/runtime-outcome.mjs',"
    )
  );
  assert.deepEqual(
    JSON.parse(content('apps/demo/start-bridge.routes.json')).runtime,
    { '/': 200 }
  );

  // App-owned expectations: an explicit redirect is declared, never implied.
  const routesPath = path.join(root, 'apps/demo/start-bridge.routes.json');
  fs.writeFileSync(
    routesPath,
    `${JSON.stringify({
      runtime: { '/': { redirect: '/login' }, '/about': 200 },
    })}\n`
  );
  const declared = plan(root).writes.find((write) =>
    write.path.endsWith('native-built-worker.runtime.mjs')
  ).content;
  assert.match(
    declared,
    /^const EXPECTED = \{"\/":\{"redirect":"\/login"\},"\/about":200\};$/m
  );
  for (const invalid of [503, { redirect: '' }, 'ok', { status: 200 }]) {
    fs.writeFileSync(
      routesPath,
      `${JSON.stringify({ runtime: { '/': invalid } })}\n`
    );
    assert.match(
      plan(root).problems.join('\n'),
      /start-bridge\.routes\.json: runtime\["\/"\]: /,
      JSON.stringify(invalid)
    );
  }
  // Containers that would drop the root assertion are problems, not defaults.
  for (const runtime of [{}, [], { '/about': 200 }]) {
    fs.writeFileSync(routesPath, `${JSON.stringify({ runtime })}\n`);
    assert.match(
      plan(root).problems.join('\n'),
      /start-bridge\.routes\.json: runtime (?:must declare the root|must be a record)/,
      JSON.stringify(runtime)
    );
  }
  assert.match(content('tuturuuu.ci.ts'), /'demo-cloudflare\.yaml': true,/);
  assert.equal(
    JSON.parse(content('apps/demo/package.json')).scripts['test:runtime'],
    'node --test cloudflare/*.runtime.mjs'
  );
});
