import { existsSync, readdirSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { createSourceGraph } from './inventory-source';

export function filesUnder(root: string): string[] {
  return readdirSync(root, { withFileTypes: true })
    .flatMap((entry) => {
      const file = resolve(root, entry.name);
      return entry.isDirectory() ? filesUnder(file) : [file];
    })
    .sort();
}
export function routePattern(file: string) {
  return `/${file
    .split('/')
    .slice(0, -1)
    .filter((part) => !/^\(.+\)$/u.test(part) && !part.startsWith('@'))
    .join('/')}`;
}
export function generateInventory(repo: string) {
  const appDir = resolve(repo, 'apps/contacts/src/app');
  const graph = createSourceGraph(repo);
  const routes = filesUnder(appDir).flatMap((file) => {
    const local = relative(appDir, file);
    const name = local.split('/').at(-1) ?? '';
    const page = /^page\.[cm]?[jt]sx?$/u.test(name);
    const handler = /^route\.[cm]?[jt]sx?$/u.test(name);
    const metadata =
      /^(?:robots|sitemap|manifest|icon\d*|apple-icon\d*|favicon|opengraph-image\d*|twitter-image\d*)\.(?:[cm]?[jt]sx?|json|ico|png|jpg|svg|webmanifest|txt|xml)$/u.test(
        name
      );
    if (!page && !handler && !metadata) return [];
    const source = relative(repo, file);
    const roots = [source];
    if (page) {
      for (
        let dir = dirname(file);
        dir.startsWith(appDir);
        dir = dirname(dir)
      ) {
        for (const boundary of ['layout', 'template']) {
          for (const ext of ['ts', 'tsx', 'js', 'jsx']) {
            const candidate = resolve(dir, `${boundary}.${ext}`);
            if (existsSync(candidate)) roots.push(relative(repo, candidate));
          }
        }
      }
    }
    let pattern = routePattern(local);
    if (metadata) {
      const stem = name.replace(/\.[^.]+$/u, '');
      const endpoint =
        stem === 'robots'
          ? 'robots.txt'
          : stem === 'sitemap'
            ? 'sitemap.xml'
            : stem === 'manifest'
              ? 'manifest.webmanifest'
              : /\.[cm]?[jt]sx?$/u.test(name)
                ? stem
                : name;
      pattern = `${pattern === '/' ? '' : pattern}/${endpoint}`;
    }
    return [
      {
        pattern,
        source,
        category: page
          ? 'page'
          : pattern.startsWith('/api/')
            ? 'api'
            : metadata
              ? 'metadata'
              : 'route',
        owner: 'contacts-next',
        disposition: 'Next-fallback',
        cacheComponents: true,
        roots,
        boundaries: /\.[cm]?[jt]sx?$/u.test(name)
          ? graph.boundaries(roots)
          : {},
      },
    ];
  });
  const globals = graph.boundaries([
    'apps/contacts/src/proxy.ts',
    'apps/contacts/next.config.ts',
  ]);
  const publicDir = resolve(repo, 'apps/contacts/public');
  const assets = existsSync(publicDir)
    ? filesUnder(publicDir).map((file) => ({
        pattern: `/${relative(publicDir, file)}`,
        source: relative(repo, file),
        category: 'public-asset',
        owner: 'contacts-next',
        disposition: 'Next-fallback',
      }))
    : [];
  const rewrites = [
    '/api/workspaces/invitations',
    '/api/v1/workspaces/:wsId/settings/permissions',
  ].map((pattern) => ({
    pattern,
    category: 'api-rewrite',
    owner: 'web-next',
    disposition: 'Next-fallback',
    source: 'apps/contacts/next.config.ts',
  }));
  const entries = [
    ...routes,
    ...assets,
    ...rewrites,
    {
      pattern: '/api/:path*',
      category: 'api-proxy',
      owner: 'web-next',
      disposition: 'Next-fallback',
      source: 'apps/contacts/next.config.ts',
    },
    {
      pattern: '/[[locale]]/[wsId]/[[...nonContactsPath]]',
      category: 'workspace-redirect',
      owner: 'web-next',
      disposition: 'Next-fallback',
      source: 'apps/contacts/src/proxy.ts',
    },
    {
      pattern: '/__contacts1',
      category: 'candidate-probe',
      owner: 'contacts-start',
      disposition: 'native-Start',
      source: 'apps/contacts/cloudflare/start/routes/[__contacts1].ts',
    },
  ];
  return {
    schemaVersion: 1,
    generatedBy: 'bun apps/contacts/cloudflare/generate-inventory.ts',
    analysis:
      'Conservative first-party static import closure with inherited layouts/templates. Unresolved edges block future native slices; no runtime parity implied.',
    cacheComponentsSource: 'packages/utils/src/next-config.ts',
    locale: {
      supported: ['en', 'vi'],
      prefix: 'never',
      explicitPrefix: 'Next redirects and sets NEXT_LOCALE',
    },
    apiOwnership: {
      precedence:
        'Contacts local feedback/payment/auth handlers win; remaining workspace APIs and /api/* stay with Web via Contacts Next rewrites',
      source: 'apps/contacts/next.config.ts',
    },
    globals,
    crons: [],
    summary: {
      total: entries.length,
      categories: Object.fromEntries(
        [...new Set(entries.map((route) => route.category))]
          .sort()
          .map((category) => [
            category,
            entries.filter((route) => route.category === category).length,
          ])
      ),
      dispositions: Object.fromEntries(
        ['native-Start', 'Next-fallback'].map((disposition) => [
          disposition,
          entries.filter((route) => route.disposition === disposition).length,
        ])
      ),
    },
    routes: entries,
    modules: Object.fromEntries(
      [...graph.modules].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    ),
  };
}
export function routeManifest(inventory: ReturnType<typeof generateInventory>) {
  return {
    schemaVersion: 2,
    generatedBy: inventory.generatedBy,
    locale: inventory.locale,
    apiOwnership: inventory.apiOwnership,
    crons: inventory.crons,
    summary: inventory.summary,
    routes: inventory.routes.map(
      ({ pattern, source, category, owner, disposition }) => ({
        pattern,
        source,
        category,
        owner,
        disposition,
      })
    ),
  };
}
