// Native CI for a converted app: a thin caller of the reusable
// `.github/workflows/native-start-app.yaml` (as Shortener's), the per-app
// artifact helper over `scripts/ci/apps-native-artifact.py`, and a generic
// emitted-Worker smoke test. Pure functions of the resolved options.

import fs from 'node:fs';
import path from 'node:path';
import { GENERATED_MARKER } from './contract.mjs';
import { pascal } from './templates.mjs';

export const NATIVE_TEMPLATE = '.github/workflows/native-start-app.yaml';
/**
 * Runs only through `test:runtime` (`node --test <file>`) after the native
 * build: not a `*.test.*` name, so source Vitest and check:changed never run
 * it against a missing artifact.
 */
export const RUNTIME_TEST = 'cloudflare/native-built-worker.runtime.mjs';
/** `test:runtime`: the generated runtime test and any app-owned ones. */
export const RUNTIME_COMMAND = 'node --test cloudflare/*.runtime.mjs';

/** Repository CI files every native app workflow depends on (as Shortener). */
const SHARED_CI_PATHS = [
  'scripts/ci/apps-native-artifact.py',
  'scripts/ci/apps-native-runtime-pointer.mjs',
  'scripts/ci/native-emitted-config-receipt.mjs',
  'scripts/ci/native-config-default-probe.mjs',
  'scripts/ci/native-receipt-layout.mjs',
  'scripts/ci/production-publication-policy.ts',
  'bun.lock',
  NATIVE_TEMPLATE,
  '.github/workflows/ci-check.yml',
  '.github/actions/setup-bun-with-retry/action.yml',
  '.github/actions/run-with-turbo-remote-cache/action.yml',
  'scripts/ci/generate-build-metadata.ts',
  'scripts/ci/check-workflow-config.ts',
  'scripts/ci/workflow-config-core.ts',
  'scripts/ci/workspace-dependency-closure.ts',
  'scripts/ci/resolve-changed-files-core.ts',
  'scripts/ci/resolve-changed-files.ts',
  'package.json',
  'turbo.json',
  'tuturuuu.ts',
  'tuturuuu.ci.ts',
];

// YAML single-quoted scalars and JS string literals.
const quote = (value) => `'${String(value).replace(/'/gu, "''")}'`;
const js = (value) => JSON.stringify(String(value));
const helperPath = (app) => `scripts/ci/${app}-native-artifact.py`;
export const callerPath = (app) => `.github/workflows/${app}-cloudflare.yaml`;

/** Workspace package directories the app depends on, transitively. */
export function workspaceClosure(repoRoot, manifest) {
  const byName = new Map();
  for (const dir of ['packages', 'apps']) {
    const root = path.join(repoRoot, dir);
    if (!fs.existsSync(root)) continue;
    for (const entry of fs.readdirSync(root)) {
      const file = path.join(root, entry, 'package.json');
      if (!fs.existsSync(file)) continue;
      const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (pkg.name) byName.set(pkg.name, { dir: `${dir}/${entry}`, pkg });
    }
  }
  const workspaceDeps = (pkg) =>
    Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })
      .filter(([, version]) => String(version).startsWith('workspace:'))
      .map(([name]) => name);
  const seen = new Set();
  const queue = workspaceDeps(manifest);
  while (queue.length > 0) {
    const name = queue.shift();
    const found = byName.get(name);
    if (!found || seen.has(found.dir)) continue;
    seen.add(found.dir);
    queue.push(...workspaceDeps(found.pkg));
  }
  return [...seen].sort();
}

export function callerWorkflow({
  app,
  rootHost,
  packageName,
  closure,
  formatPaths,
  hasTestScript,
}) {
  const App = pascal(app);
  const paths = [
    `apps/${app}/**`,
    ...closure.map((dir) => `${dir}/**`),
    helperPath(app),
    callerPath(app),
    ...SHARED_CI_PATHS,
  ];
  const pathList = paths.map((entry) => `        ${quote(entry)},`).join('\n');
  const sameRepo =
    "(github.event_name != 'pull_request' || github.event.pull_request.head.repo.full_name == github.repository)";
  const unit = hasTestScript
    ? ''
    : `\n      # No app test script: run the app's Vitest suite if it has one.\n      unit-command: bun x --no-install vitest run --passWithNoTests`;
  return `# ${GENERATED_MARKER} for ${app}; re-run it instead of editing.
name: ${App} Cloudflare Source
on:
  workflow_call:
  workflow_dispatch:
  pull_request:
    paths:
      [
${pathList}
      ]
  push:
    branches: [main]
    paths:
      [
${pathList}
      ]
permissions:
  contents: read
concurrency:
  group: \${{ github.workflow }}-\${{ github.event_name }}-\${{ github.event.pull_request.number || github.ref }}-\${{ (github.run_attempt > 1 || (github.event_name != 'pull_request' && github.event_name != 'pull_request_target' && (github.event_name != 'push' || github.ref == 'refs/heads/production' || startsWith(github.ref, 'refs/heads/release-please--branches--')))) && format('{0}-{1}-{2}', github.sha, github.run_id, github.run_attempt) || 'latest' }}
  cancel-in-progress: \${{ !(github.run_attempt > 1) && (github.event_name == 'pull_request' || github.event_name == 'pull_request_target' || (github.event_name == 'push' && github.ref != 'refs/heads/production' && !startsWith(github.ref, 'refs/heads/release-please--branches--'))) }}
jobs:
  check-ci:
    uses: ./.github/workflows/ci-check.yml
    permissions:
      contents: read
      deployments: read
    with:
      workflow_name: ${app}-cloudflare.yaml
  # Qualification only: no staging or production publisher.
  native:
    needs: check-ci
    if: needs.check-ci.outputs.should_run == 'true'
    uses: ./${NATIVE_TEMPLATE}
    permissions:
      contents: read
    with:
      app: ${app}
      package: ${quote(packageName)}
      artifact-script: ${helperPath(app)}
      env-interface: ${App}GeneratedEnv
      worker-environment-type: ${App}Environment${unit}
      # Public staging values from repository variables for same-repository
      # events; fork pull requests (and unset variables) build with fixtures.
      public-env: |
        NEXT_PUBLIC_SUPABASE_URL=\${{ ${sameRepo} && vars.STAGING_SUPABASE_URL || 'https://${app}-ci.supabase.invalid' }}
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=\${{ ${sameRepo} && vars.STAGING_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_${app.replace(/-/gu, '_')}_ci_placeholder' }}
        NEXT_PUBLIC_APP_URL=https://${rootHost}
        NEXT_PUBLIC_WEB_APP_URL=https://tuturuuu.com
        TUTURUUU_NOINDEX=1
      format-paths: >-
        ${formatPaths.map((entry) => `apps/${app}/${entry}`).join(' ')}
`;
}

export function artifactHelper({ app, workerName, publicFiles }) {
  const envName = `${app.toUpperCase().replace(/-/gu, '_')}_SOURCE_SHA`;
  const files = publicFiles.map((file) => `    ${JSON.stringify(file)},`);
  return `# ${GENERATED_MARKER} for ${app}; re-run it instead of editing.
"""Validate and preserve the ${app} staging artifact; never deploy.

Reuses the reviewed Apps seal/restore implementation with this app's Worker
identity, public files and source-SHA channel.
"""
import importlib.util
import os
from pathlib import Path

WORKER = ${JSON.stringify(workerName)}
PUBLIC_FILES = (
${files.join('\n')}
)


def load():
    path = Path(__file__).with_name("apps-native-artifact.py")
    spec = importlib.util.spec_from_file_location(${JSON.stringify(`${app.replace(/-/gu, '_')}_native_artifact_base`)}, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.IDENTITY = {**module.IDENTITY, "name": WORKER}
    module.NORMALIZED_DEFAULTS = {**module.NORMALIZED_DEFAULTS, "topLevelName": WORKER}
    module.RECEIPT = ${JSON.stringify(`${app}-native-artifact.json`)}
    module.PUBLIC_FILES = PUBLIC_FILES
    return module


def main():
    # The shared CLI reads its exact source from APPS_SOURCE_SHA.
    if ${JSON.stringify(envName)} in os.environ:
        os.environ["APPS_SOURCE_SHA"] = os.environ[${JSON.stringify(envName)}]
    else:
        os.environ.pop("APPS_SOURCE_SHA", None)
    load().main()


if __name__ == "__main__":
    main()
`;
}

/**
 * The generic emitted-Worker acceptance the template runs after sealing:
 * Worker identity, public-file parity, the app's declared page outcomes
 * (\`runtime\` in start-bridge.routes.json: an exact status or an expected
 * redirect, so a login redirect never passes as a public page), the apex
 * mount answering like the root, and an unknown path without a server error,
 * with all egress denied.
 * App-specific acceptance belongs in further \`cloudflare/*.runtime.mjs\` files,
 * which \`test:runtime\` runs with it.
 */
export function runtimeTest({
  app,
  workerName,
  publicFiles,
  hasBuildInfo,
  expectations = { '/': 200 },
}) {
  const buildInfo = hasBuildInfo
    ? `
  await t.test('build identity is the exact compiled source', async () => {
    const info = await (await get('/api/build-info')).json();
    assert.equal(info.appName, ${js(app)});
    assert.equal(info.commitHash, source);
  });
`
    : '';
  return `// ${GENERATED_MARKER} for ${app}; re-run it instead of editing.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { readNativeRuntimeConfig } from '../../../scripts/ci/apps-native-runtime-pointer.mjs';

const app = await realpath(fileURLToPath(new URL('../', import.meta.url)));
const require = createRequire(join(app, 'package.json'));
const WORKER = ${js(workerName)};
const PUBLIC_FILES = [${publicFiles.map(js).join(', ')}];
// From start-bridge.routes.json \`runtime\`: a status, or a redirect prefix.
const EXPECTED = ${JSON.stringify(expectations)};

async function sha256(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

// Run a disposable copy so runtime state can never touch the sealed output.
async function stageArtifact() {
  const { configPath, config } = readNativeRuntimeConfig(app);
  const scratch = await realpath(await mkdtemp(join(tmpdir(), '${app}-native-')));
  await cp(join(app, 'dist'), join(scratch, 'dist'), {
    recursive: true,
    verbatimSymlinks: true,
  });
  const envFile = join(scratch, 'synthetic.env');
  await writeFile(envFile, '', { flag: 'wx', mode: 0o600 });
  const registry = join(scratch, 'registry');
  await mkdir(registry, { mode: 0o700 });
  return {
    scratch,
    config,
    envFile,
    registry,
    configPath: join(scratch, relative(app, configPath)),
  };
}

test('emitted ${app} Worker serves its root, mount and unknown paths', {
  timeout: 120000,
}, async (t) => {
  assert.equal(
    process.env.CI,
    'true',
    'Run only after the owning CI native build, never as a source-only unit test'
  );
  const source = process.env.CI_SOURCE_SHA;
  assert.match(source ?? '', /^[a-f0-9]{40}$/);
  const staged = await stageArtifact();
  t.after(() => rm(staged.scratch, { recursive: true, force: true }));
  const { config } = staged;
  assert.equal(config.name, WORKER);
  assert.equal(config.no_bundle, true);
  assert.equal(config.assets.run_worker_first, true);
  assert.ok(config.compatibility_flags.includes('nodejs_compat'));
  assert.equal(config.vars?.TUTURUUU_NOINDEX, '1');
  for (const name of PUBLIC_FILES)
    assert.equal(
      await sha256(join(app, 'dist/client', name)),
      await sha256(join(app, 'public', name)),
      \`Public file drift: \${name}\`
    );

  // Every outbound request is denied and recorded; nothing leaves the host.
  const egress = [];
  const sdk = require('wrangler');
  const worker = await sdk.unstable_startWorker({
    config: staged.configPath,
    envFiles: [staged.envFile],
    sendMetrics: false,
    bindings: {
      INTERNAL_WEB_API_ORIGIN: { type: 'plain_text', value: 'https://central.invalid' },
    },
    build: { bundle: false, processEntrypoint: false },
    dev: {
      remote: false,
      watch: false,
      persist: false,
      inspector: false,
      liveReload: false,
      generateTypes: false,
      enableContainers: false,
      registry: staged.registry,
      server: { hostname: '127.0.0.1', port: 0 },
      inferOriginFromRoutes: false,
      routeRequestsByRoutes: false,
      auth: () => {
        throw new Error('Provider auth forbidden in the ${app} smoke test');
      },
      outboundService: (request) => {
        egress.push(new URL(request.url).origin);
        return new Response('{"error":"denied by the smoke test"}', {
          status: 401,
          headers: { 'content-type': 'application/json' },
        });
      },
    },
  });
  t.after(() => worker.dispose());
  await worker.ready;
  const origin = (await worker.url).origin;
  const get = (path, init = {}) =>
    fetch(\`\${origin}\${path}\`, { redirect: 'manual', ...init });
  // fetch() drops a custom Host header; the apex mount needs one.
  const statusFor = (path, host) =>
    new Promise((resolve, reject) => {
      const target = new URL(path, origin);
      httpRequest(
        { host: target.hostname, port: target.port, path: target.pathname, headers: { host } },
        (response) => {
          response.resume();
          resolve(response.statusCode ?? 0);
        }
      )
        .on('error', reject)
        .end();
    });
${buildInfo}
  await t.test('public pages answer as start-bridge.routes.json expects', async () => {
    for (const [path, expected] of Object.entries(EXPECTED)) {
      const response = await get(path);
      const location = response.headers.get('location');
      const outcome = \`\${path}: \${response.status}\${location ? \` -> \${location}\` : ''}\`;
      if (typeof expected === 'number') {
        assert.equal(response.status, expected, outcome);
        continue;
      }
      assert.ok(response.status >= 300 && response.status < 400 && location, outcome);
      const target = new URL(location, origin);
      const actual =
        target.origin === origin ? \`\${target.pathname}\${target.search}\` : target.href;
      assert.ok(actual.startsWith(expected.redirect), \`\${outcome}; expected \${expected.redirect}\`);
    }
  });

  await t.test('the apex mount answers like the root', async () => {
    const root = (await get('/')).status;
    const mounted = await statusFor('/${app}', 'tuturuuu.com');
    assert.equal(mounted, root, \`tuturuuu.com/${app}: \${mounted}, root /: \${root}\`);
  });

  await t.test('an unknown path is not a server error', async () => {
    const response = await get('/__native-smoke-missing__');
    assert.ok(response.status < 500, String(response.status));
  });

  t.diagnostic(\`denied egress origins: \${[...new Set(egress)].join(', ') || 'none'}\`);
});
`;
}
