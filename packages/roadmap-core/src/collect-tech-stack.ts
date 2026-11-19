import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  getAppBasePath,
  SHARED_APP_ORIGIN,
} from '../../utils/src/app-mounts.ts';
import { PROBED_APPS } from './live/host-probe.ts';
import type { AppTechStack, TechStack } from './tech-stack.ts';

const wranglerConfigs = ['wrangler.json', 'wrangler.jsonc', 'wrangler.toml'];
const cfConfigs = [
  'cloudflare.config.ts',
  'cloudflare.config.mts',
  'cf.config.ts',
];
const pausedApps = new Set(['backend', 'tanstack-web']);
const publicOrigins = new Map(
  PROBED_APPS.map(({ app, url }) => [app, new URL(url).origin])
);

function read(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...value }
    : {};
}

function readJson(path: string) {
  const source = read(path);
  return source === undefined ? undefined : object(JSON.parse(source));
}

function getGatewayRoutes(root: string) {
  const routes = readJson(join(root, 'apps/gateway/src/manifest.json'))?.routes;
  return Array.isArray(routes) ? routes.map(object) : [];
}

function heldApps(policy: string): Set<string> {
  const exclusions =
    /export const productionAppExclusions[^=]*=\s*\{([\s\S]*?)^\}/m.exec(
      policy
    )?.[1] ?? '';
  const publication =
    /export const productionPublicationPolicy\s*=\s*\{([\s\S]*?)^\}|export const productionPublicationPolicy\s*=\s*\{(.*)\}/m.exec(
      policy
    );
  return new Set([
    ...Array.from(exclusions.matchAll(/^\s*([\w-]+):/gm), ([, id]) => id),
    ...Array.from(
      (publication?.[1] ?? publication?.[2] ?? '').matchAll(
        /['"]?([\w-]+)['"]?\s*:\s*\{\s*state:\s*['"]held['"]/g
      ),
      ([, id]) => id
    ),
  ]);
}

// Only literal routes on the public host or the app's known mount count.
// Candidate profiles, preview hostnames and route-free uploads cannot prove a cutover.
function configuredRoutes(config: string): string[] {
  return Array.from(
    config.matchAll(
      /(?:^|[,\s{])['"]?(?:pattern|route)['"]?\s*[:=]\s*['"]([^'"]+)['"]|\broutes\s*[:=]\s*\[\s*['"]([^'"]+)['"]/gm
    ),
    ([, pattern, route]) => (pattern ?? route).replace(/\/?\*$/, '')
  );
}

function selectDeployCli(
  hosting: TechStack['hosting'],
  deploy: string
): TechStack['deployCli'] {
  if (hosting !== 'nativeWorker' && hosting !== 'openNext') return null;
  if (
    deploy
      .split('\n')
      .some(
        (line) =>
          /(?:^|\s)cf\s+deploy\b/.test(line) &&
          !line.includes('--dry-run') &&
          !line.trimStart().startsWith('#')
      )
  ) {
    return 'cf';
  }
  return 'wrangler';
}

export function collectTechStack(root: string): AppTechStack[] {
  const gatewayRoutes = getGatewayRoutes(root);
  const gatewayConfig = (read(join(root, 'apps/gateway/wrangler.jsonc')) ?? '')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');
  const gatewayMounts = new Set(
    (/"GATEWAY_MOUNTED_PATHS"\s*:\s*"([^"]*)"/.exec(gatewayConfig)?.[1] ?? '')
      .split(',')
      .map((value) => value.trim())
  );
  const seoPolicy = readJson(join(root, 'packages/utils/src/seo-policy.json'));
  const inventory =
    read(
      join(
        root,
        'apps/docs/build/devops/tanstack-cloudflare-migration-inventory.mdx'
      )
    ) ?? '';
  const documentedVercel = new Set(
    Array.from(
      inventory.matchAll(/^\| ([a-z][a-z0-9-]*) \|[^|]+\| Vercel\b/gm),
      ([, id]) => id
    )
  );
  const held = heldApps(read(join(root, 'tuturuuu.ci.ts')) ?? '');
  const apps = join(root, 'apps');
  return readdirSync(apps, { withFileTypes: true })
    .filter(
      (entry) => entry.isDirectory() && /^[a-z][a-z0-9-]*$/.test(entry.name)
    )
    .map(({ name }) => name)
    .sort()
    .map((id): AppTechStack => {
      const dir = join(apps, id);
      const pkg = readJson(join(dir, 'package.json'));
      const deps = {
        ...object(pkg?.dependencies),
        ...object(pkg?.devDependencies),
      };
      const scripts = object(pkg?.scripts);
      const build = String(scripts.build ?? '');
      const vercel =
        readJson(join(dir, 'vercel.json')) !== undefined ||
        documentedVercel.has(id);
      const wrangler = wranglerConfigs
        .map((file) => read(join(dir, file)))
        .filter((source) => source !== undefined);
      const cf = cfConfigs
        .map((file) => read(join(dir, file)))
        .filter((source) => source !== undefined);
      const voidConfig = read(join(dir, 'void.config.ts'));
      const voidWorker =
        voidConfig && /target:\s*['"]cloudflare['"]/.test(voidConfig);
      const targetPath =
        id === 'web' || id === 'marketing'
          ? '/'
          : (getAppBasePath(id) ?? `/${id}`);
      const targetUrl = new URL(targetPath, SHARED_APP_ORIGIN).href.replace(
        /\/$/,
        ''
      );
      const seoOrigin = object(seoPolicy?.[id]).origin;
      const publicOrigin =
        publicOrigins.get(id) ??
        (typeof seoOrigin === 'string' &&
        /^https:\/\/[a-z0-9.-]+$/.test(seoOrigin)
          ? seoOrigin
          : undefined);
      const routes = configuredRoutes(
        [...wrangler, ...cf, voidWorker ? voidConfig : ''].join('\n')
      );
      const directMount = routes.includes(targetUrl.slice('https://'.length));
      const binding = `MOUNT_${targetPath.slice(1).replace(/-/g, '_').toUpperCase()}`;
      const gatewayMount =
        (gatewayMounts.has(targetPath) &&
          gatewayConfig.includes(`"${binding}"`)) ||
        gatewayRoutes.some(
          (route) =>
            targetPath !== '/' &&
            route.origin === id &&
            ((Array.isArray(route.exact) && route.exact.includes(targetPath)) ||
              (Array.isArray(route.prefix) &&
                route.prefix.includes(`${targetPath}/`)))
        );
      const worker =
        wrangler.length > 0 || cf.length > 0 || Boolean(voidWorker);
      const openNext =
        'next' in deps &&
        ('@opennextjs/cloudflare' in deps ||
          read(join(dir, 'open-next.config.ts')) !== undefined);
      const workerRoute =
        directMount ||
        (worker && gatewayMount) ||
        routes.includes(
          publicOrigin?.slice('https://'.length) ?? `${id}.tuturuuu.com`
        );
      const paused = pausedApps.has(id);
      const hosting = paused
        ? null
        : worker && (workerRoute || !vercel)
          ? openNext && !voidWorker
            ? 'openNext'
            : 'nativeWorker'
          : vercel
            ? 'vercel'
            : null;
      const framework =
        'next' in deps &&
        (!('@tanstack/react-start' in deps) ||
          hosting === 'vercel' ||
          hosting === 'openNext' ||
          (!workerRoute && /\bnext build\b/.test(build)))
          ? 'next'
          : '@tanstack/react-start' in deps
            ? 'start'
            : 'other';
      const bundler =
        framework === 'next'
          ? 'next'
          : 'vite-plus' in deps
            ? voidConfig && 'void' in deps
              ? 'vitePlusVoid'
              : 'vitePlus'
            : 'vite' in deps
              ? 'vite'
              : 'other';
      const workflow =
        read(join(root, '.github/workflows', `${id}-cloudflare.yaml`)) ?? '';
      const deploy = Object.entries(scripts)
        .filter(([name]) => name === 'deploy' || name.startsWith('deploy:'))
        .map(([, command]) => command)
        .concat(workflow)
        .join('\n');
      const current: TechStack = {
        framework,
        bundler,
        hosting,
        deployCli: selectDeployCli(hosting, deploy),
        url: paused
          ? null
          : directMount || gatewayMount
            ? targetUrl
            : (publicOrigin ??
              (routes.includes(`${id}.tuturuuu.com`)
                ? `https://${id}.tuturuuu.com`
                : null)),
      };
      if (paused) return { id, current, status: 'paused' };
      if (framework === 'other') return { id, current, status: 'outside' };
      const status =
        framework === 'start' && hosting === 'nativeWorker' && workerRoute
          ? 'cutOver'
          : held.has(id)
            ? 'held'
            : 'candidate';
      return { id, current, status, targetUrl };
    });
}
