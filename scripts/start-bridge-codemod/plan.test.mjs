import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { applyPlan, main } from './cli.mjs';
import { GENERATED_MARKER } from './contract.mjs';
import { createFixtureRepo, fakeCodegen, writeTree } from './fixture-repo.mjs';
import { pendingWrites, planConversion } from './plan.mjs';

const noCommands = () => ({ status: 0 });
const HOLD_FILES = [
  'tuturuuu.ci.ts',
  'scripts/ci/production-publication-policy.ts',
  'scripts/ci/production-publication-policy.test.js',
  '.github/workflows/vercel-production-demo.yaml',
];
const plan = (root, options = {}) =>
  planConversion(root, 'demo', { codegen: fakeCodegen(), ...options });

test('dry run reads only and plans the full owned file set', (t) => {
  const root = createFixtureRepo(t);
  const before = fs.readFileSync(path.join(root, 'tuturuuu.ci.ts'), 'utf8');
  const result = plan(root);
  assert.deepEqual(result.problems, []);
  const created = pendingWrites(result).map((write) => write.path);
  for (const file of [
    'apps/demo/start-bridge.routes.json',
    'apps/demo/vite.config.mts',
    'apps/demo/void.config.ts',
    'apps/demo/cloudflare/worker.ts',
    'apps/demo/src/routes/$.tsx',
    'apps/demo/src/routes/index.tsx',
    'apps/demo/src/routeTree.gen.ts',
    'apps/demo/src/start-bridge/api-registry.bridge.gen.ts',
    'apps/demo/src/start-bridge/page-registry.bridge.gen.ts',
  ])
    assert.ok(created.includes(file), file);
  // The repository's biome.json already keeps generated route trees out.
  assert.equal(created.includes('biome.json'), false);
  // Production stays untouched without --hold.
  for (const file of HOLD_FILES) assert.ok(!created.includes(file), file);
  assert.equal(
    fs.readFileSync(path.join(root, 'tuturuuu.ci.ts'), 'utf8'),
    before
  );
  assert.equal(
    fs.existsSync(path.join(root, 'apps/demo/vite.config.mts')),
    false
  );
});

test('apply then re-plan is a no-op (idempotent)', (t) => {
  const root = createFixtureRepo(t);
  const first = plan(root);
  applyPlan(root, first, { spawn: noCommands });
  assert.deepEqual(pendingWrites(plan(root)), []);
  // A later --hold run (the cutover-prep PR) adds only the held record.
  const held = plan(root, { hold: true });
  assert.deepEqual(
    pendingWrites(held)
      .map((write) => write.path)
      .sort(),
    [...HOLD_FILES].sort()
  );
  applyPlan(root, held, { spawn: noCommands });
  assert.deepEqual(pendingWrites(plan(root, { hold: true })), []);
  const policy = fs.readFileSync(path.join(root, 'tuturuuu.ci.ts'), 'utf8');
  assert.match(
    policy,
    /demo: \{ state: 'held', reason: 'held for wave-2 cutover' \}/
  );
  assert.equal(policy.match(/\bdemo:/gu).length, 1);
});

test('generated config targets the staging Worker and keeps Next build', (t) => {
  const root = createFixtureRepo(t);
  applyPlan(root, plan(root), { spawn: noCommands });
  const read = (file) =>
    fs.readFileSync(path.join(root, 'apps/demo', file), 'utf8');
  assert.match(read('void.config.ts'), /name: 'tuturuuu-demo-vite-staging'/);
  assert.match(read('void.config.ts'), /TUTURUUU_NOINDEX: '1'/);
  assert.match(
    read('vite.config.mts'),
    /startBridgePreset\(\{\n {2}appRoot: import\.meta\.url,\n {2}app: 'demo',/
  );
  // Client navigation runs the app proxy so rewrites match SSR.
  const pageRoute = read('src/start-bridge/page-route.tsx');
  assert.match(pageRoute, /import \{ proxy \} from '\.\.\/proxy';/);
  assert.match(pageRoute, /resolvePageLocation\(data, \{\n\s*proxy,/);
  const worker = read('cloudflare/worker.ts');
  assert.match(worker, /import \{ proxy \} from '\.\.\/src\/proxy';/);
  // Route handlers load from the rsc environment, never statically into ssr.
  assert.match(
    worker,
    /import\.meta\.viteRsc\.loadModule\('rsc', 'bridge-api'\)/
  );
  assert.doesNotMatch(worker, /from '\.\.\/src\/start-bridge\/api-registry/);
  assert.match(
    read('vite.config.mts'),
    /rscEntries: \{\n?\s*'bridge-api': new URL\(\n?\s*'\.\/src\/start-bridge\/api-entry\.ts',/
  );
  assert.match(
    read('vite.config.mts'),
    /'bridge-pages': new URL\(\n?\s*'\.\/src\/start-bridge\/page-modules\.bridge\.gen\.ts',/
  );
  assert.match(
    read('src/start-bridge/public-assets.bridge.gen.ts'),
    /'\/favicon\.ico',\n {2}'\/robots\.txt',/
  );
  const manifest = JSON.parse(read('package.json'));
  assert.equal(manifest.scripts.build, 'next build --turbopack');
  assert.equal(
    manifest.scripts['build:cloudflare'],
    'vp build --configLoader runner'
  );
  assert.equal(
    manifest.scripts['dev:cloudflare'],
    // biome-ignore lint/suspicious/noTemplateCurlyInString: shell parameter expansion
    'vp dev --configLoader runner --host 127.0.0.1 --port ${PORT:-7899}'
  );
  assert.deepEqual(manifest.dependencies, {
    next: '^16.4.0',
    react: '^19.2.8',
  });
  assert.equal(
    manifest.scripts['type-check:cloudflare'],
    'tsc --noEmit -p tsconfig.cloudflare.json'
  );
  assert.deepEqual(JSON.parse(read('tsconfig.json')).exclude, [
    'node_modules',
    'cloudflare',
    'src/routeTree.gen.ts',
    'src/router.tsx',
    'src/routes',
    'src/start-bridge',
    'src/start.ts',
    'start-bridge.config.ts',
    'vite.config.mts',
    'void.config.ts',
  ]);
  assert.match(read('src/router.tsx'), /ssr: \{ nonce: requestNonce\(\) \},/);
  // Workers types would retype `Response` app-wide; the entry types its env.
  const cloudflareTsconfig = JSON.parse(read('tsconfig.cloudflare.json'));
  assert.deepEqual(cloudflareTsconfig.compilerOptions.types, [
    'vite/client',
    'node',
  ]);
  // Tests keep their Next/Vitest type-check; the build validates vite.config.
  assert.ok(cloudflareTsconfig.exclude.includes('**/*.test.tsx'));
  assert.equal(cloudflareTsconfig.include.includes('vite.config.mts'), false);
  const config = JSON.parse(read('start-bridge.routes.json'));
  assert.deepEqual(config.stripSegments, { '[locale]': { locale: 'vi' } });
});

test('generator inputs come from the app configuration, not hand edits', (t) => {
  const root = createFixtureRepo(t);
  const generated = (result, file) =>
    result.writes.find((write) => write.path === `apps/demo/${file}`)?.content;
  // Defaults: no proxy config, no Web rewrites, no app-base resolver.
  const plain = plan(root);
  assert.doesNotMatch(generated(plain, 'cloudflare/worker.ts'), /matches:/);
  assert.match(
    generated(plain, 'src/start-bridge/central-first.ts'),
    /export const centralFirst: readonly string\[\] = \[\];/
  );
  assert.equal(generated(plain, 'src/start-bridge/app-base.ts'), undefined);
  assert.doesNotMatch(generated(plain, 'src/router.tsx'), /app-base/);
  // The fixture page imports next/og: Meet's Workers port is wired.
  assert.match(
    generated(plain, 'vite.config.mts'),
    /og: '@cloudflare\/pages-plugin-vercel-og\/api'/
  );
  assert.ok(
    plain.commands.some((command) =>
      command.argv.includes('@cloudflare/pages-plugin-vercel-og@0.1.2')
    )
  );
  assert.deepEqual(plain.config.api, {
    out: 'src/start-bridge/api-registry.bridge.gen.ts',
    patternsOut: 'src/start-bridge/api-patterns.bridge.gen.ts',
    lazy: true,
  });

  // The app's own proxy matcher, next.config Web rewrites, and #6764.
  writeTree(path.join(root, 'apps/demo'), {
    'src/proxy.ts':
      "export async function proxy() {}\nexport const config = { matcher: ['/((?!_next|.*\\\\..*).*)'] };\n",
    'next.config.ts':
      "import { createTuturuuuWebWorkspaceApiRewrites } from '@tuturuuu/utils/next-config';\nexport default { rewrites: async () => ({ beforeFiles: createTuturuuuWebWorkspaceApiRewrites('https://tuturuuu.com') }) };\n",
  });
  writeTree(root, {
    'packages/internal-api/src/internal-api-url.ts':
      'export function registerDefaultAppBaseResolver() {}\n',
  });
  const manifestPath = path.join(root, 'apps/demo/package.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.dependencies['@tuturuuu/internal-api'] = 'workspace:*';
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const full = plan(root);
  const worker = generated(full, 'cloudflare/worker.ts');
  assert.match(worker, /import \{ config as proxyConfig, proxy \} from/);
  assert.match(
    worker,
    /matches: createProxyMatcher\(proxyConfig\.matcher, defaultProxyMatches\)/
  );
  assert.match(worker, /\n {4}centralFirst,\n/);
  assert.match(
    generated(full, 'src/start-bridge/central-first.ts'),
    /TUTURUUU_WEB_WORKSPACE_API_RESERVED_PATHS as centralFirst/
  );
  assert.match(
    generated(full, 'src/start-bridge/app-base.ts'),
    /registerDefaultAppBaseResolver\(\n {2}createAppBaseResolver\(appApiPatterns, centralFirst\)/
  );
  // Registered in every environment bundle: browser/ssr, rsc pages, rsc API.
  assert.match(
    generated(full, 'src/router.tsx'),
    /^import '\.\/start-bridge\/app-base';/m
  );
  assert.match(
    generated(full, 'src/start-bridge/page-route.tsx'),
    /^import '\.\/app-base';/m
  );
  assert.match(
    generated(full, 'src/start-bridge/api-entry.ts'),
    /^import '\.\/app-base';\nexport \{ endpoints \}/m
  );
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
  const runtime = content(
    'apps/demo/cloudflare/native-built-worker.runtime.mjs'
  );
  assert.match(runtime, /const WORKER = "tuturuuu-demo-vite-staging";/);
  assert.match(runtime, /build identity is the exact compiled source/);
  assert.match(runtime, /statusFor\('\/demo', 'tuturuuu\.com'\)/);
  // A public root must answer 200, not merely "no 5xx" (a login redirect).
  assert.match(runtime, /^const EXPECTED = \{"\/":200\};$/m);
  assert.match(runtime, /assert\.equal\(response\.status, expected, outcome\)/);
  assert.match(runtime, /assert\.equal\(mounted, root,/);
  assert.doesNotMatch(runtime, /root < 500|mounted < 500/);
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
      /runtime\["\/"\] must be a non-5xx status or \{ "redirect"/,
      JSON.stringify(invalid)
    );
  }
  assert.match(content('tuturuuu.ci.ts'), /'demo-cloudflare\.yaml': true,/);
  assert.equal(
    JSON.parse(content('apps/demo/package.json')).scripts['test:runtime'],
    'node --test cloudflare/*.runtime.mjs'
  );
});

test('the app-owned Worker config is created once and never overwritten', (t) => {
  const root = createFixtureRepo(t);
  const first = plan(root);
  const config = first.writes.find(
    (write) => write.path === 'apps/demo/start-bridge.config.ts'
  );
  assert.equal(config?.owner, 'app-owned');
  assert.match(
    config?.content ?? '',
    /export default defineBridgeAppConfig\(\{\}\);/
  );
  const worker = first.writes.find(
    (write) => write.path === 'apps/demo/cloudflare/worker.ts'
  )?.content;
  assert.match(worker, /import appConfig from '\.\.\/start-bridge\.config';/);
  assert.match(
    worker,
    /\.\.\.appConfig\.mounts,\n {4}\},\n {4}csp: appConfig\.csp,/
  );
  assert.match(
    worker,
    /appConfig\.wrapResponse\(response, \{ request, env \}\)/
  );
  assert.match(worker, /\n {4}apiOrigin: appConfig\.apiOrigin,\n/);
  applyPlan(root, first, { spawn: noCommands });
  // The app's own options survive every re-run.
  const owned =
    "import { defineBridgeAppConfig } from '@tuturuuu/start-bridge/start/app-config';\nexport default defineBridgeAppConfig({ mounts: { unknownHost: 'reject' } });\n";
  fs.writeFileSync(path.join(root, 'apps/demo/start-bridge.config.ts'), owned);
  assert.deepEqual(pendingWrites(plan(root)), []);
  assert.equal(
    fs.readFileSync(
      path.join(root, 'apps/demo/start-bridge.config.ts'),
      'utf8'
    ),
    owned
  );
});

test('dependencies are installed by package commands, never by edits', (t) => {
  const root = createFixtureRepo(t);
  const result = plan(root);
  assert.equal(result.commands.length, 2);
  assert.deepEqual(result.commands[0].argv.slice(0, 3), [
    'bun',
    'add',
    '--exact',
  ]);
  assert.ok(
    result.commands[0].argv.includes('@tuturuuu/start-bridge@workspace:*')
  );
  assert.deepEqual(result.commands[1].argv.slice(0, 4), [
    'bun',
    'add',
    '--dev',
    '--exact',
  ]);
  assert.ok(result.commands.every((command) => command.cwd === 'apps/demo'));
  const calls = [];
  applyPlan(root, result, {
    spawn: (bin, args, options) => {
      calls.push([bin, ...args, options.cwd]);
      return { status: 0 };
    },
  });
  assert.equal(calls.length, 2);
  assert.ok(
    calls.every((call) => call.at(-1) === path.join(root, 'apps/demo'))
  );
});

test('hand-maintained route config entries survive a re-run', (t) => {
  const root = createFixtureRepo(t);
  applyPlan(root, plan(root), { spawn: noCommands });
  const file = path.join(root, 'apps/demo/start-bridge.routes.json');
  const config = JSON.parse(fs.readFileSync(file, 'utf8'));
  config.ignored = { '[locale]/og/page.tsx': 'served by Web' };
  fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
  const again = plan(root);
  assert.deepEqual(again.config.ignored, {
    '[locale]/og/page.tsx': 'served by Web',
  });
  assert.equal(
    pendingWrites(again).some((write) => write.path.endsWith('routes.json')),
    false
  );
});

test('an unmarked hand-written owned file is a conflict unless adopted', (t) => {
  const root = createFixtureRepo(t);
  fs.writeFileSync(
    path.join(root, 'apps/demo/vite.config.mts'),
    'export default {};\n'
  );
  const result = plan(root);
  const conflict = result.writes.find(
    (write) => write.path === 'apps/demo/vite.config.mts'
  );
  assert.equal(conflict.conflict, true);
  fs.writeFileSync(
    path.join(root, 'apps/demo/void.config.ts'),
    `// ${GENERATED_MARKER} for demo; old bytes\n`
  );
  const marked = plan(root).writes.find(
    (write) => write.path === 'apps/demo/void.config.ts'
  );
  assert.equal(marked.status, 'update');
  assert.equal(marked.conflict, false);
});

test('codegen errors (unregistered route/page) block apply', (t) => {
  const root = createFixtureRepo(t);
  const result = plan(root, {
    codegen: fakeCodegen(['src/app/x/route.ts: unregistered route']),
  });
  assert.deepEqual(result.problems, [
    'codegen: src/app/x/route.ts: unregistered route',
  ]);
});

test('cli dry-run exits non-zero without writing when blocked', (t) => {
  const root = createFixtureRepo(t);
  const output = [];
  const io = {
    stdout: { write: (chunk) => output.push(chunk) },
    stderr: { write: (chunk) => output.push(chunk) },
  };
  // No bridge package exists in the fixture, so codegen reports a problem.
  assert.equal(main(['demo', '--apply'], io, root), 1);
  assert.equal(
    fs.existsSync(path.join(root, 'apps/demo/vite.config.mts')),
    false
  );
  assert.match(output.join(''), /codegen is not available/);
  assert.equal(main(['demo', '--bogus'], io, root), 2);
});

test('a missing proxy is reported as a problem', (t) => {
  const root = createFixtureRepo(t);
  fs.rmSync(path.join(root, 'apps/demo/src/proxy.ts'));
  const result = plan(root);
  assert.match(result.problems.join('\n'), /no src\/proxy\.ts/);
  assert.equal(
    result.writes.some((write) => write.path.endsWith('cloudflare/worker.ts')),
    false
  );
});

test('--hold without a Vercel publisher is a problem; no hold is not', (t) => {
  const root = createFixtureRepo(t);
  fs.rmSync(path.join(root, '.github/workflows/vercel-production-demo.yaml'));
  assert.deepEqual(plan(root).problems, []);
  assert.match(
    plan(root, { hold: true }).problems.join('\n'),
    /vercel-production-demo\.yaml: missing/
  );
});

test('an invalid app id is rejected before any filesystem access', () => {
  assert.throws(
    () => planConversion('/nonexistent', '../web'),
    /Invalid app id/
  );
});

test('a legacy .env.example moves to env.example for Void', (t) => {
  const root = createFixtureRepo(t);
  fs.writeFileSync(path.join(root, 'apps/demo/.env.example'), 'A=1\n');
  const first = plan(root);
  assert.deepEqual(first.removals, ['apps/demo/.env.example']);
  applyPlan(root, first, { spawn: noCommands });
  assert.equal(fs.existsSync(path.join(root, 'apps/demo/.env.example')), false);
  assert.equal(
    fs.readFileSync(path.join(root, 'apps/demo/env.example'), 'utf8'),
    'A=1\n'
  );
  const second = plan(root);
  assert.deepEqual(second.removals, []);
  assert.deepEqual(pendingWrites(second), []);
});

test('owned output is formatted; generator output keeps its bytes', (t) => {
  const root = createFixtureRepo(t);
  const seen = [];
  const result = plan(root, {
    format: (file, content) => {
      seen.push(file);
      return `${content}// formatted\n`;
    },
  });
  const byPath = Object.fromEntries(
    result.writes.map((write) => [write.path, write])
  );
  assert.match(
    byPath['apps/demo/vite.config.mts'].content,
    /\/\/ formatted\n$/u
  );
  assert.doesNotMatch(
    byPath['apps/demo/src/routeTree.gen.ts'].content,
    /formatted/u
  );
  assert.equal(
    seen.some((file) => file.endsWith('.bridge.gen.ts')),
    false
  );
  assert.equal(seen.includes('tuturuuu.ci.ts'), false);
  assert.ok(seen.includes('apps/demo/tsconfig.json'));
});
