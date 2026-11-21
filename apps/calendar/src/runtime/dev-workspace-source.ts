import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Workspace packages that publish only a built `dist`. internal-api and types
 * emit CommonJS there, which the dev server's Cloudflare worker runner cannot
 * evaluate, and a fresh checkout has no `dist` at all. In dev they resolve to
 * their TypeScript source, so the dev server needs no package build.
 */
const SPECIFIER = /^@tuturuuu\/(internal-api|types|supabase|masonry)(\/.*)?$/u;
const SOURCE_IMPORTER =
  /\/packages\/(internal-api|types|supabase|masonry)\/src\//u;

/** Condition order per environment, mirroring the app's resolver conditions. */
const CLIENT_CONDITIONS = ['browser', 'import', 'module', 'default'];
const SERVER_CONDITIONS = ['workerd', 'worker', 'import', 'module', 'default'];

type Target = string | null | { [condition: string]: Target };
type Manifest = {
  exports?: Record<string, Target>;
  imports?: Record<string, Target>;
};

const manifests = new Map<string, Manifest>();

function manifestFor(packageDir: string): Manifest {
  let manifest = manifests.get(packageDir);
  if (!manifest) {
    manifest = JSON.parse(
      readFileSync(join(packageDir, 'package.json'), 'utf8')
    ) as Manifest;
    manifests.set(packageDir, manifest);
  }
  return manifest;
}

/** Picks a conditional export or import target for the environment. */
function conditionalTarget(
  target: Target | undefined,
  client: boolean
): string | undefined {
  if (typeof target === 'string') return target;
  if (!target) return undefined;
  for (const condition of client ? CLIENT_CONDITIONS : SERVER_CONDITIONS) {
    const picked = conditionalTarget(target[condition], client);
    if (picked) return picked;
  }
  return undefined;
}

/** Maps a `./dist/<file>.js` or `./src/<file>` target to its source file. */
function sourceFor(packageDir: string, target: string) {
  if (target.startsWith('./src/')) {
    const direct = join(packageDir, target);
    return existsSync(direct) ? direct : null;
  }
  if (!target.startsWith('./dist/')) return null;
  const relative = target.replace(/^\.\/dist\//u, 'src/').replace(/\.js$/u, '');
  for (const extension of ['.ts', '.tsx']) {
    const candidate = join(packageDir, `${relative}${extension}`);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** Resolves a dist-only workspace specifier to source, or null when unknown. */
export function resolveWorkspaceSource(
  packagesRoot: string,
  specifier: string,
  client = false
) {
  const match = SPECIFIER.exec(specifier);
  if (!match) return null;
  const packageDir = join(packagesRoot, match[1]!);
  const exports = manifestFor(packageDir).exports ?? {};
  const key = `.${match[2] ?? ''}`;
  if (key in exports) {
    const exact = conditionalTarget(exports[key], client);
    return exact ? sourceFor(packageDir, exact) : null;
  }
  for (const [pattern, target] of Object.entries(exports)) {
    const star = pattern.indexOf('*');
    const path = conditionalTarget(target, client);
    if (star === -1 || !path) continue;
    const prefix = pattern.slice(0, star);
    const suffix = pattern.slice(star + 1);
    if (!key.startsWith(prefix) || !key.endsWith(suffix)) continue;
    const value = key.slice(prefix.length, key.length - suffix.length);
    // Like Node's export matcher, a capture may not leave the package.
    if (value.split('/').some((segment) => segment === '..' || segment === '.'))
      return null;
    return sourceFor(packageDir, path.replace('*', value));
  }
  return null;
}

/**
 * Resolves a package-internal `#import` from inside one of these packages'
 * source to source, since its conditional targets point at `dist`.
 */
export function resolveWorkspaceInternalImport(
  packagesRoot: string,
  specifier: string,
  importer: string | undefined,
  client: boolean
) {
  if (!specifier.startsWith('#') || !importer) return null;
  const match = SOURCE_IMPORTER.exec(importer);
  if (!match) return null;
  const packageDir = join(packagesRoot, match[1]!);
  const target = conditionalTarget(
    manifestFor(packageDir).imports?.[specifier],
    client
  );
  return target ? sourceFor(packageDir, target) : null;
}

/**
 * Dev-only plugin: builds keep resolving the packages' published `dist`.
 * Specifiers denied to the client are left to import protection there.
 */
export function devWorkspaceSourcePlugin(
  packagesRoot: string,
  { clientDenied = [] }: { clientDenied?: readonly string[] } = {}
) {
  return {
    name: 'calendar-dev-workspace-source',
    apply: 'serve' as const,
    enforce: 'pre' as const,
    resolveId(
      this: { environment?: { name: string } },
      source: string,
      importer?: string
    ) {
      const client = this.environment?.name === 'client';
      if (client && clientDenied.includes(source)) return undefined;
      return (
        resolveWorkspaceSource(packagesRoot, source, client) ??
        resolveWorkspaceInternalImport(
          packagesRoot,
          source,
          importer,
          client
        ) ??
        undefined
      );
    },
  };
}
