import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { resolve } from 'node:path';
import { SourceTextModule, SyntheticModule } from 'node:vm';

// Run the actual entry and Mail handler; isolate framework and service suppliers.
export async function loadMail(result) {
  const emit = () => {
    if (result instanceof Error) throw result;
    return result;
  };
  const mocks = {
    forwardToCentralApi: emit,
    retarget: (request, url) => new Request(url, request),
    resolveAppBase: (url) => ({
      mode: url.pathname.startsWith('/mail/') ? 'mounted' : 'subdomain',
    }),
    matchRoute: (pattern, path) => (pattern === path ? {} : null),
    runtimeAppBase: () => '',
    createBridgeHandler: () => emit,
    createBridgeStartHandler: () => ({}),
    readCountry: () => 'ZZ',
    createAppSwitchWriteBudget: () => ({}),
    handleAppSwitchBeacon: emit,
    resolveTuturuuuWebAppUrl: () => 'https://example.test',
    applyOneOriginNoindex: (response) => response,
    decideOneOriginRequest: (request) => ({ action: 'serve', request }),
    workerBuildInfo: () => Response.json({ app: 'mail' }),
    proxy: () => {},
    endpoints: [],
    MAIL_FUNCTION_BASE: '/_server',
    registerMailServerApiPaths: () => {},
    mailAppPath: (request) => {
      const path = new URL(request.url).pathname;
      return path === '/outside' ? null : path.replace(/^\/mail(?=\/)/u, '');
    },
    mailMounts: {},
    prepareMailFunctionRequest: async (request) => request,
    nativeFunctionProxy: () => {},
    mailOneOriginConfig: () => ({}),
    proxyMatches: () => true,
    publicAssets: new Set(),
    applyMailResponsePolicy: (_request, response) => response,
    applyMailDocumentHeaders: (_request, response) => response,
  };
  const cache = new Map();
  async function source(file) {
    file = resolve(file);
    if (cache.has(file)) return cache.get(file);
    const text =
      process.env.HSTS_MAIL_BASELINE === '1' &&
      file.endsWith('/mail/cloudflare/worker.ts')
        ? execFileSync(
            'git',
            [
              'show',
              'ba4332fed5f07064678c7281fda75259b8eaf4da:apps/mail/cloudflare/worker.ts',
            ],
            { encoding: 'utf8' }
          )
        : await readFile(file, 'utf8');
    const mod = new SourceTextModule(stripTypeScriptTypes(text), {
      identifier: file,
    });
    cache.set(file, mod);
    await mod.link(async (specifier) => {
      if (specifier === '#mail-handler')
        return source('apps/mail/src/runtime/handler.ts');
      if (specifier === '@tuturuuu/start-bridge/response-policy')
        return source('packages/start-bridge/src/core/response-policy.ts');
      if (
        specifier.startsWith('@tuturuuu/utils/') &&
        [
          'framable-paths',
          'seo-robots',
          'staging-cookie-policy',
          'staging-hosts',
        ].includes(specifier.split('/').at(-1))
      )
        return source(`packages/utils/src/${specifier.split('/').at(-1)}.ts`);
      return new SyntheticModule(Object.keys(mocks), function () {
        for (const [key, value] of Object.entries(mocks))
          this.setExport(key, value);
      });
    });
    return mod;
  }
  const entry = await source('apps/mail/cloudflare/worker.ts');
  await entry.evaluate();
  return entry.namespace.default;
}
