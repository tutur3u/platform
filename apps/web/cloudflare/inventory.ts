import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { createSatelliteApiRewrites } from '../src/lib/satellite-api-rewrites';
import { createSourceGraph } from './inventory-source';
import { nativeLegalChangesPages, nativeLegalPages } from './native-legal';
import { nativeSecurityPages } from './native-security';

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
    .filter((segment) => !/^\(.+\)$/u.test(segment) && !segment.startsWith('@'))
    .join('/')}`;
}

export function generateInventory(repo: string) {
  const appDir = resolve(repo, 'apps/web/src/app');
  const graph = createSourceGraph(repo);
  const vercel: { crons: { path: string; schedule: string }[] } = JSON.parse(
    readFileSync(resolve(repo, 'apps/web/vercel.json'), 'utf8')
  );
  const routes = filesUnder(appDir).flatMap((file) => {
    const local = relative(appDir, file);
    const name = local.split('/').at(-1) ?? '';
    const isPage = /^page\.[cm]?[jt]sx?$/u.test(name);
    const isRoute = /^route\.[cm]?[jt]sx?$/u.test(name);
    const isMetadata =
      /^(?:robots|sitemap|manifest|icon\d*|apple-icon\d*|favicon|opengraph-image\d*|twitter-image\d*)\.(?:[cm]?[jt]sx?|json|ico|png|jpg|svg|webmanifest|txt|xml)$/u.test(
        name
      );
    if (!isPage && !isRoute && !isMetadata) return [];
    const source = relative(repo, file);
    const roots = [source];
    if (isPage) {
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
    if (isMetadata) {
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
    const nativeSource = nativeLegalChangesPages.some(
      (page) => page.source === source
    )
      ? 'apps/web/src/components/legal/legal-changes.tsx'
      : nativeLegalPages.some((page) => page.source === source)
        ? 'apps/web/cloudflare/start/legal-page.tsx'
        : nativeSecurityPages.some((page) => page.source === source)
          ? 'apps/web/cloudflare/start/security-page.tsx'
          : null;
    const serviceWorker = local === 'serwist/[path]/route.ts';
    return [
      {
        pattern,
        source,
        category: serviceWorker
          ? 'service-worker'
          : isPage
            ? 'page'
            : pattern.startsWith('/api/')
              ? 'api'
              : isMetadata
                ? 'metadata'
                : 'route',
        owner: nativeSource ? 'web-start' : 'web-next',
        disposition: nativeSource ? 'native-Start' : 'Next-fallback',
        cacheComponents: true,
        ...(nativeSource
          ? {
              nativeSource,
              nativeBoundaries: graph.boundaries([
                nativeSource,
                'apps/web/cloudflare/start/routes/__root.tsx',
                'apps/web/cloudflare/start/static-handler.tsx',
              ]),
            }
          : {}),
        roots,
        boundaries: /\.[cm]?[jt]sx?$/u.test(name)
          ? graph.boundaries(roots)
          : {},
        cronOwner: vercel.crons.some((cron) => cron.path === pattern)
          ? 'vercel-web'
          : null,
      },
    ];
  });
  const globals = graph.boundaries([
    'apps/web/src/proxy.ts',
    'apps/web/next.config.ts',
    'apps/web/src/app/sw.ts',
  ]);
  // Proxy-only URL bridges have no App Router file.
  const bridges = [
    ['mail', 'mail'],
    ['finance', 'finance'],
    ['drive', 'drive'],
    ['chat', 'chat'],
    ['time-tracker', 'track'],
    ['meet', 'meet'],
    ['users', 'contacts'],
    ['workforce', 'contacts'],
    ['posts', 'contacts'],
    ['forms', 'forms'],
  ].map(([segment, app]) => ({
    pattern: `/[[locale]]/[wsId]/${segment}/[[...path]]`,
    category: 'satellite-bridge',
    owner: app,
    disposition: 'Next-fallback',
    source: 'apps/web/src/proxy.ts',
    cronOwner: null,
  }));
  const rewrites = createSatelliteApiRewrites({
    calendarAppOrigin: 'calendar:',
    infrastructureAppOrigin: 'infrastructure:',
  }).map(({ source, destination }) => ({
    pattern: source,
    category: 'api-rewrite',
    owner: destination.startsWith('calendar:') ? 'calendar' : 'infrastructure',
    disposition: 'Next-fallback',
    source: 'apps/web/src/lib/satellite-api-rewrites.ts',
    cronOwner: null,
  }));
  const entries = [
    ...routes,
    ...bridges,
    {
      pattern: '/[[locale]]/shared/forms/[shareCode]/[[...path]]',
      category: 'satellite-bridge',
      owner: 'forms',
      disposition: 'Next-fallback',
      source: 'apps/web/src/proxy.ts',
      cronOwner: null,
    },
    {
      pattern: '/[[locale]]/qr-generator',
      category: 'satellite-bridge',
      owner: 'tools',
      disposition: 'Next-fallback',
      source: 'apps/web/src/proxy.ts',
      cronOwner: null,
    },
    ...rewrites,
    {
      pattern: '/__web1',
      category: 'candidate-probe',
      owner: 'web-start',
      disposition: 'native-Start',
      source: 'apps/web/cloudflare/start/routes/[__web1].ts',
      cronOwner: null,
    },
  ];
  return {
    schemaVersion: 1,
    stagingUnmigrated: 'not-migrated-404',
    generatedBy: 'bun apps/web/cloudflare/generate-inventory.ts',
    analysis:
      'Conservative first-party static import closure, including inherited layouts/templates. Signal lines live in modules; unresolved imports remain migration blockers. No runtime parity is implied.',
    cacheComponentsSource: 'packages/utils/src/next-config.ts',
    globals,
    serviceWorker: {
      url: '/serwist/sw.js',
      scope: '/',
      owner: 'web-next',
      source: 'apps/web/src/app/sw.ts',
      disposition: 'Next-fallback',
      bypassPrefixes: ['/meet', '/mail'],
    },
    crons: vercel.crons.map((cron) => ({
      ...cron,
      owner: 'vercel-web',
      status: 'BLOCKER: port in a later PR; no ownership transfer',
    })),
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
    stagingUnmigrated: inventory.stagingUnmigrated,
    generatedBy: inventory.generatedBy,
    serviceWorker: inventory.serviceWorker,
    crons: inventory.crons,
    summary: inventory.summary,
    routes: inventory.routes.map((route) => ({
      pattern: route.pattern,
      source: route.source,
      category: route.category,
      owner: route.owner,
      disposition: route.disposition,
      cronOwner: route.cronOwner,
      ...('nativeSource' in route ? { nativeSource: route.nativeSource } : {}),
    })),
  };
}
