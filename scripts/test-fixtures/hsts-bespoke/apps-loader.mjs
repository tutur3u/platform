import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { resolve } from 'node:path';
import { SourceTextModule, SyntheticModule } from 'node:vm';

// Execute the app-owned entry and guards; isolate route/framework suppliers.
// Node's VM linker rejects a second module with the same identifier while
// the first is still linking, so overlapping fixture loads take one turn.
let loadQueue = Promise.resolve();

export function loadWorker(app, result) {
  const run = loadQueue.then(() => loadWorkerNow(app, result));
  loadQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function loadWorkerNow(app, result) {
  const cache = new Map();
  const emit = () => {
    if (result instanceof Error) throw result;
    return result;
  };
  const mocks = {
    handleTasksRequest: emit,
    apiRequest: emit,
    canonicalLocaleRedirect: () => null,
    localeCookie: () => 'locale=en; Path=/',
    requestLocale: () => 'en',
    gatewayDestination: () => ({ kind: 'render' }),
    default: { fetch: emit },
    workerBuildInfo: () => null,
    forwardCentralApi: emit,
    guardShortenerApi: emit,
    appendContextCookies: (response) => response,
    setContextPage: () => {},
    withRequestContext: (_request, run) => run(),
    shortenerRequest: emit,
    createSupabaseLinkStore: () => ({}),
    createFunctionProxy: () => ({}),
    resolveAppBase: () => true,
    defaultProxyMatches: () => true,
    createProxyMatcher: () => () => true,
    bridgeErrorResponse: () =>
      new Response('Internal Server Error', { status: 500 }),
    createBridgeHandler: () => emit,
    createBridgeStartHandler: () => ({ fetch: emit }),
    proxy: () => {},
    config: { matcher: [] },
    centralFirst: [],
    publicAssets: new Set(),
    isDriveProductionEnvironment: () => true,
    isDriveStagingEnvironment: () => true,
  };
  async function source(file) {
    file = resolve(file);
    if (cache.has(file)) return cache.get(file);
    let text =
      process.env.HSTS_APPS_BASELINE === '1' &&
      file.endsWith('/apps/cloudflare/worker.ts')
        ? execFileSync(
            'git',
            [
              'show',
              'c4f798a61beed0611279c0d6054ec80699f70efb:apps/apps/cloudflare/worker.ts',
            ],
            { encoding: 'utf8' }
          )
        : await readFile(file, 'utf8');
    if (file.endsWith('/drive/cloudflare/worker.ts')) {
      text = text.replace(
        "import.meta.viteRsc.loadModule('rsc', 'bridge-api')",
        'Promise.resolve({ endpoints: [] })'
      );
    }
    const mod = new SourceTextModule(stripTypeScriptTypes(text), {
      identifier: file,
    });
    cache.set(file, mod);
    await mod.link(async (specifier, parent) => {
      let target;
      if (specifier === '@tuturuuu/start-bridge/response-policy')
        target = 'packages/start-bridge/src/core/response-policy.ts';
      else if (specifier === '@tuturuuu/start-bridge/base-path')
        target = 'packages/start-bridge/src/core/base-path.ts';
      else if (specifier === '@tuturuuu/start-bridge/mounts')
        target = 'packages/start-bridge/src/core/mounts.ts';
      else if (specifier === '@tuturuuu/start-bridge/startup')
        target = 'packages/start-bridge/src/server/startup.ts';
      else if (
        specifier.startsWith('@tuturuuu/utils/') &&
        [
          'framable-paths',
          'seo-robots',
          'staging-cookie-policy',
          'staging-hosts',
        ].includes(specifier.split('/').at(-1))
      )
        target = `packages/utils/src/${specifier.split('/').at(-1)}.ts`;
      else if (
        [
          './startup',
          './required-bindings',
          '../src/native/required-secrets',
        ].includes(specifier)
      )
        target = resolve(parent.identifier, '..', `${specifier}.ts`);
      if (target) return source(target);
      const values = { ...mocks };
      if (specifier === '../start-bridge.config')
        values.default = { mounts: {} };
      if (specifier === '@tuturuuu/start-bridge/start/app-config') {
        values.CSP_REPORT_PATH = '/api/csp-report';
        values.collectDocumentSecurityReport = () =>
          new Response(null, {
            status: 204,
            headers: { 'Cache-Control': 'no-store' },
          });
        values.secureBridgeDocument = (response) => response;
      } else if (specifier === '@tuturuuu/start-bridge/csp') {
        values.createNonce = () => 'fixture-nonce';
        values.defaultContentSecurityPolicy = () => "default-src 'none'";
      } else if (specifier === '@tuturuuu/start-bridge/mount-isolation') {
        values.hasAmbiguousSupabaseSession = () => false;
        values.isolateMountedRequest = (request) => request;
        values.scopeMountedResponseCookies = (response) => response;
        values.stripMountedSupabaseWrites = (response) => response;
      } else if (specifier === '@tuturuuu/start-bridge/start/csrf-admission')
        values.admitMountedMutation = () => null;
      else if (
        specifier === '@tuturuuu/start-bridge/start/mounted-session-guard'
      )
        values.stripMountedSessionWrites = (response) => response;
      return new SyntheticModule(Object.keys(values), function () {
        for (const [key, value] of Object.entries(values))
          this.setExport(key, value);
      });
    });
    return mod;
  }
  const entry = await source(`apps/${app}/cloudflare/worker.ts`);
  await entry.evaluate();
  return entry.namespace.default;
}
