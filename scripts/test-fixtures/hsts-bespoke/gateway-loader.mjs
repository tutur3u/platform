import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { resolve } from 'node:path';
import { SourceTextModule, SyntheticModule } from 'node:vm';

// Execute the app-owned entry and guards; isolate route/framework suppliers.
export async function loadWorker(app, result) {
  const cache = new Map();
  const emit = () => {
    if (result instanceof Error) throw result;
    return result;
  };
  const mocks = {
    getLaunchableAppByTitle: () => null,
    getGatewayApp: () => null,
    buildGatewayRedirectUrl: () => 'https://pay.tuturuuu.com/',
    createElement: () => ({}),
    renderToStaticMarkup: () => '<main>catalogue</main>',
    CatalogueEntry: () => null,
    catalogueMessages: {
      en: {
        appsGateway: { metadata: { title: 'Apps', description: 'Catalogue' } },
      },
    },
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
    createBridgeStartHandler: () => ({}),
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
      process.env.HSTS_GATEWAY_BASELINE === '1' &&
      file.endsWith('/apps/cloudflare/gateway-worker.ts')
        ? execFileSync(
            'git',
            [
              'show',
              '2e3f529c748f660ae29a92d0f20bf6df644922d3:apps/apps/cloudflare/gateway-worker.ts',
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
      return new SyntheticModule(Object.keys(values), function () {
        for (const [key, value] of Object.entries(values))
          this.setExport(key, value);
      });
    });
    return mod;
  }
  const entry = await source(`apps/${app}/cloudflare/gateway-worker.ts`);
  await entry.evaluate();
  return entry.namespace.default;
}
