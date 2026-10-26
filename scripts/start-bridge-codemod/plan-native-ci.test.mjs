// Split from plan.test.mjs (700-line ceiling): the generated native CI.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { applyPlan } from './cli.mjs';
import { createFixtureRepo, fakeCodegen, writeTree } from './fixture-repo.mjs';
import { pendingWrites, planConversion } from './plan.mjs';

// Hermetic: the real start-bridge.config.ts loader has its own test.
const plan = (root, options = {}) =>
  planConversion(root, 'demo', {
    codegen: fakeCodegen(),
    loadAppConfig: () => ({ config: {} }),
    ...options,
  });

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
  assert.ok(helper.includes('"workers_dev": True,'));
  assert.match(content('apps/demo/void.config.ts'), /workers_dev: true,/);
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
  assert.match(worker, /basePath: '\/demo',\n {2}\.\.\.appConfig\.mounts,/);
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
    runtime.includes(
      `const WORKER_CONFIG = {"workersDev":true,"compatibilityFlags":${flags}};`
    )
  );
  assert.match(
    runtime,
    /effectiveWorkerConfig\(appConfig, DEFAULT_MOUNTS\),\s*WORKER_CONFIG,\s*'start-bridge\.config\.ts changed since the codemod ran: re-run it'/
  );
  assert.ok(
    runtime.includes(
      'assert.deepEqual(config.compatibility_flags, WORKER_CONFIG.compatibilityFlags);'
    )
  );
  assert.ok(
    runtime.includes(
      'assert.equal(config.workers_dev, WORKER_CONFIG.workersDev);'
    )
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

test('app-owned Worker options shape the generated Worker config', (t) => {
  const root = createFixtureRepo(t);
  writeTree(root, {
    '.github/workflows/native-start-app.yaml': 'on: workflow_call\n',
  });
  const emitted = (config) => {
    const result = plan(root, { loadAppConfig: () => ({ config }) });
    const content = (file) =>
      result.writes.find((write) => write.path === file)?.content ?? '';
    return {
      problems: result.problems,
      voidConfig: content('apps/demo/void.config.ts'),
      helper: content('scripts/ci/demo-native-artifact.py'),
      runtime: content('apps/demo/cloudflare/native-built-worker.runtime.mjs'),
    };
  };
  const flags = (list) => list.map((flag) => `'${flag}'`).join(', ');

  // Default: workers.dev on, the required flags.
  const base = emitted({});
  assert.deepEqual(base.problems, []);
  assert.match(base.voidConfig, /workers_dev: true,/);
  assert.ok(
    base.voidConfig.includes(
      `compatibility_flags: [${flags(['nodejs_compat', 'global_fetch_strictly_public'])}],`
    )
  );

  // Root-only (unknown hosts rejected): workers.dev defaults off everywhere.
  const rootOnly = emitted({
    mounts: { mountHosts: [], unknownHost: 'reject' },
  });
  assert.deepEqual(rootOnly.problems, []);
  assert.match(rootOnly.voidConfig, /workers_dev: false,/);
  assert.ok(rootOnly.helper.includes('"workers_dev": False,'));
  assert.ok(rootOnly.runtime.includes('"workersDev":false'));
  // An explicit override wins.
  assert.match(
    emitted({ mounts: { unknownHost: 'reject' }, worker: { workersDev: true } })
      .voidConfig,
    /workers_dev: true,/
  );

  // An added flag (AI's stream-cancel metering) joins the required ones once.
  const ai = emitted({
    worker: {
      compatibilityFlags: ['enable_request_signal', 'nodejs_compat'],
    },
  });
  const aiFlags = [
    'nodejs_compat',
    'global_fetch_strictly_public',
    'enable_request_signal',
  ];
  assert.ok(
    ai.voidConfig.includes(`compatibility_flags: [${flags(aiFlags)}],`)
  );
  assert.ok(
    ai.helper.includes(`"compatibility_flags": ${JSON.stringify(aiFlags)},`)
  );
  assert.ok(
    ai.runtime.includes(`"compatibilityFlags":${JSON.stringify(aiFlags)}`)
  );

  // Invalid options and contradictions are problems, never silent output.
  for (const [config, problem] of [
    [{ worker: { workersDev: 'no' } }, /workersDev must be a boolean/],
    [{ worker: { compatibilityFlags: 'x' } }, /compatibilityFlags must be/],
    [
      { worker: { compatibilityFlags: ['Bad Flag'] } },
      /compatibilityFlags must be/,
    ],
    [{ worker: { name: 'x' } }, /worker\.name is not a supported option/],
    [
      {
        mounts: {
          rootHosts: ['demo-staging.example.workers.dev'],
          unknownHost: 'reject',
        },
      },
      /workers\.dev host but workers_dev is off/,
    ],
  ])
    assert.match(emitted(config).problems.join('\n'), problem);
  assert.match(
    plan(root, {
      loadAppConfig: () => ({ error: 'could not be loaded' }),
    }).problems.join('\n'),
    /start-bridge\.config\.ts: could not be loaded/
  );

  // Re-applying with the same options changes nothing.
  const config = {
    mounts: { mountHosts: [], unknownHost: 'reject' },
    worker: { compatibilityFlags: ['enable_request_signal'] },
  };
  applyPlan(root, plan(root, { loadAppConfig: () => ({ config }) }), {
    spawn: () => ({ status: 0 }),
  });
  assert.deepEqual(
    pendingWrites(plan(root, { loadAppConfig: () => ({ config }) })).map(
      (write) => write.path
    ),
    []
  );
});

test('the generated Worker states its effective mounts and fails safely', (t) => {
  const root = createFixtureRepo(t);
  writeTree(root, {
    '.github/workflows/native-start-app.yaml': 'on: workflow_call\n',
  });
  const files = (config) => {
    const result = plan(root, { loadAppConfig: () => ({ config }) });
    const content = (file) =>
      result.writes.find((write) => write.path === file)?.content ?? '';
    return {
      result,
      worker: content('apps/demo/cloudflare/worker.ts'),
      runtime: content('apps/demo/cloudflare/native-built-worker.runtime.mjs'),
    };
  };

  // Default: the subdomain root and the apex mount.
  const mounted = files({}).worker;
  assert.match(
    mounted,
    /\/\/ One artifact: the subdomain root and the tuturuuu\.com\/demo mount\.\nconst mounts = \{\n {2}app: 'demo',\n {2}rootHosts: \['demo\.tuturuuu\.com'\],\n {2}mountHosts: \['tuturuuu\.com'\],\n {2}basePath: '\/demo',\n {2}\.\.\.appConfig\.mounts,\n\};/
  );

  // Root-only: no apex mount is claimed in the generated source.
  const rootOnly = {
    mounts: {
      rootHosts: ['demo.tuturuuu.com', 'demo-staging.tuturuuu.com'],
      mountHosts: [],
      unknownHost: 'reject',
    },
  };
  const { worker, runtime } = files(rootOnly);
  assert.match(
    worker,
    /\/\/ Root-only: served at demo\.tuturuuu\.com, demo-staging\.tuturuuu\.com; no apex mount, and unknown hosts are rejected\.\nconst mounts = \{\n {2}app: 'demo',\n {2}rootHosts: \['demo\.tuturuuu\.com', 'demo-staging\.tuturuuu\.com'\],\n {2}mountHosts: \[\],\n {2}unknownHost: 'reject' as const,\n {2}\.\.\.appConfig\.mounts,\n\};/
  );
  assert.doesNotMatch(worker, /tuturuuu\.com\/demo|basePath: '\/demo'/);

  // A failed route load still answers through the response policy.
  assert.match(
    worker,
    /try \{\n\s*response = await \(await handler\)\(request, env, ctx\);\n\s*\} catch \(error\) \{[\s\S]*?console\.error\('\[start-bridge\] worker failed', error\);\n\s*response = bridgeErrorResponse\(\);/
  );
  assert.match(
    worker,
    /bridgeErrorResponse,\n\s*createBridgeHandler,\n\} from '@tuturuuu\/start-bridge\/start\/handler';/
  );

  // Each built Worker proves the policy on a rendered page, a JSON API
  // response and a 404 page; status and content come before the headers.
  assert.match(
    runtime,
    /^const POLICY_PROBES = \[\{"kind":"page","path":"\/"\},\{"kind":"api","path":"\/api\/build-info"\},\{"kind":"notFound","path":"\/__native-smoke-missing__"\}\];$/m
  );
  for (const check of [
    /assert\.equal\(status, 200, where\);\s*assert\.match\(type, \/application\\\/json\/u, where\);/,
    /assert\.equal\(status, probe\.kind === 'page' \? 200 : 404, where\);\s*assert\.match\(type, \/text\\\/html\/u, where\);\s*assert\.match\(body, \/<html\[\\s>\]\/iu/,
    /no-store/,
    /headers\['x-robots-tag'\]/,
    /headers\['x-frame-options'\], 'DENY'/,
    /frame-ancestors 'none'/,
  ])
    assert.match(runtime, check);

  // Re-applying with the same configuration changes nothing.
  applyPlan(root, files(rootOnly).result, { spawn: () => ({ status: 0 }) });
  assert.deepEqual(
    pendingWrites(
      plan(root, { loadAppConfig: () => ({ config: rootOnly }) })
    ).map((write) => write.path),
    []
  );
});

test('policy probes are real pages, never a redirect standing in', (t) => {
  const root = createFixtureRepo(t);
  writeTree(root, {
    '.github/workflows/native-start-app.yaml': 'on: workflow_call\n',
  });
  const routesPath = path.join(root, 'apps/demo/start-bridge.routes.json');
  const withRoutes = (extra) => {
    applyPlan(root, plan(root), { spawn: () => ({ status: 0 }) });
    const routes = JSON.parse(fs.readFileSync(routesPath, 'utf8'));
    fs.writeFileSync(
      routesPath,
      `${JSON.stringify({ ...routes, ...extra })}\n`
    );
    return plan(root);
  };
  // Finance/Track: "/" redirects to login, so no anonymous page is declared.
  const redirecting = withRoutes({ runtime: { '/': { redirect: '/login' } } });
  assert.match(
    redirecting.problems.join('\n'),
    /runtimeProbes\.page: declare an anonymous page rendering 200 HTML/
  );
  // An explicit page probe, or an explicit reason to skip it, is accepted.
  for (const page of [
    '/pricing',
    { skip: 'auth-only; cloudflare/signed-ssr.runtime.mjs' },
  ]) {
    const result = withRoutes({
      runtime: { '/': { redirect: '/login' } },
      runtimeProbes: { page },
    });
    assert.deepEqual(result.problems, [], JSON.stringify(page));
    const runtime = result.writes.find((write) =>
      write.path.endsWith('native-built-worker.runtime.mjs')
    ).content;
    assert.ok(
      runtime.includes(
        typeof page === 'string'
          ? `{"kind":"page","path":"${page}"}`
          : `{"kind":"page","skip":"${page.skip}"}`
      )
    );
  }
});
