// Route pruning for one apps/web OpenNext family build.
//
//   bun cloudflare/opennext/prune.ts <family>           dry run, prints the plan
//   bun cloudflare/opennext/prune.ts <family> --apply   deletes unowned entries
//
// --apply runs only in a disposable checkout: the build job writes
// DISPOSABLE_MARKER first. It deletes every app route entry (page, route,
// metadata route) the family does not own, keeps layouts, proxy.ts, lib and
// packages, and writes prune-receipt.json next to families.json.
import { createHash } from 'node:crypto';
import {
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DISPOSABLE_MARKER = '.opennext-disposable-checkout';
export const DISPOSABLE_MARKER_CONTENT =
  'disposable checkout for an OpenNext family build\n';

export const DEFAULT_APP_DIR = fileURLToPath(new URL('../..', import.meta.url));

export interface OpenNextFamily {
  id: string;
  worker: string;
  kind: 'api' | 'pages';
  assetPrefix: string | null;
  wrangler: string;
  exact: string[];
  prefix: string[];
  exclude: string[];
}

export interface OpenNextFamilies {
  deny: string[];
  families: OpenNextFamily[];
}

export interface PrunePlan {
  family: string;
  worker: string;
  familiesSha256: string;
  keep: string[];
  remove: string[];
}

const CODE_ENTRY =
  /^(page|route|default|sitemap|robots|manifest|opengraph-image|twitter-image|icon|apple-icon)\.(tsx|ts|jsx|js|mjs)$/u;
const STATIC_METADATA =
  /^(favicon|icon|apple-icon|opengraph-image|twitter-image)\d*\.(ico|png|jpe?g|gif|svg)$/u;

function sha256(text: string) {
  return createHash('sha256').update(text).digest('hex');
}

export function loadFamilies(appDir = DEFAULT_APP_DIR) {
  const raw = readFileSync(
    path.join(appDir, 'cloudflare/opennext/families.json'),
    'utf8'
  );
  return { config: JSON.parse(raw) as OpenNextFamilies, sha256: sha256(raw) };
}

/** True when `pathname` is `entry` or lies below it. */
export function inSubtree(pathname: string, entry: string) {
  const base = entry.endsWith('/') ? entry.slice(0, -1) : entry;
  return pathname === base || pathname.startsWith(`${base}/`);
}

/**
 * URL pattern of an app entry relative to src/app
 * (`(group)/api/x/route.ts` → `/api/x`), or null when it is not routable.
 */
export function routePathFor(relativeFile: string) {
  const kept: string[] = [];
  for (const segment of relativeFile.split('/').slice(0, -1)) {
    if (segment.startsWith('_')) return null;
    if (segment.startsWith('(') && segment.endsWith(')')) continue;
    if (segment.startsWith('@')) continue;
    kept.push(segment);
  }
  return `/${kept.join('/')}`;
}

export function isRouteEntry(fileName: string) {
  return CODE_ENTRY.test(fileName) || STATIC_METADATA.test(fileName);
}

export function familyOwns(
  family: OpenNextFamily,
  deny: string[],
  routePath: string
) {
  if (deny.some((entry) => inSubtree(routePath, entry))) return false;
  if (family.exclude.some((entry) => inSubtree(routePath, entry))) {
    return false;
  }
  return (
    family.exact.includes(routePath) ||
    family.prefix.some((prefix) => routePath.startsWith(prefix))
  );
}

function walk(dir: string, relative: string, out: string[]) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) walk(path.join(dir, entry.name), rel, out);
    else if (entry.isFile() && isRouteEntry(entry.name)) out.push(rel);
  }
  return out;
}

/** Kept and removed app entries (paths relative to src/app) for one family. */
export function planPrune(
  familyId: string,
  appDir = DEFAULT_APP_DIR
): PrunePlan {
  const { config, sha256: familiesSha256 } = loadFamilies(appDir);
  const family = config.families.find((candidate) => candidate.id === familyId);
  if (!family) throw new Error(`Unknown OpenNext family: ${familyId}`);
  if (family.kind !== 'api') {
    throw new Error(
      `Family ${familyId} is kind "${family.kind}"; only API families can be pruned.`
    );
  }
  const keep: string[] = [];
  const remove: string[] = [];
  for (const rel of walk(path.join(appDir, 'src/app'), '', []).sort()) {
    const routePath = routePathFor(rel);
    if (routePath !== null && familyOwns(family, config.deny, routePath)) {
      keep.push(rel);
    } else {
      remove.push(rel);
    }
  }
  return {
    family: family.id,
    worker: family.worker,
    familiesSha256,
    keep,
    remove,
  };
}

export function receiptFor(plan: PrunePlan) {
  return {
    ...plan,
    keptSha256: sha256(plan.keep.join('\n')),
    removedSha256: sha256(plan.remove.join('\n')),
  };
}

/** Deletes the unowned entries. Refuses outside a disposable checkout. */
export function applyPrune(plan: PrunePlan, appDir = DEFAULT_APP_DIR) {
  const marker = path.join(appDir, DISPOSABLE_MARKER);
  if (
    !existsSync(marker) ||
    readFileSync(marker, 'utf8') !== DISPOSABLE_MARKER_CONTENT
  ) {
    throw new Error(
      `Refusing to prune: ${marker} is missing. Prune runs only in a disposable CI checkout.`
    );
  }
  if (plan.keep.length === 0) {
    throw new Error(`Refusing to prune: family ${plan.family} owns no routes.`);
  }
  for (const rel of plan.remove) rmSync(path.join(appDir, 'src/app', rel));
  const receipt = receiptFor(plan);
  writeFileSync(
    path.join(appDir, 'cloudflare/opennext/prune-receipt.json'),
    `${JSON.stringify(receipt, null, 2)}\n`
  );
  return receipt;
}

function main(argv: string[]) {
  const [familyId, flag] = argv;
  if (!familyId || (flag && flag !== '--apply')) {
    console.error('usage: prune.ts <family> [--apply]');
    return 2;
  }
  const plan = planPrune(familyId);
  if (flag === '--apply') {
    const receipt = applyPrune(plan);
    console.log(
      `pruned ${receipt.remove.length} entries; kept ${receipt.keep.length} for ${receipt.family}`
    );
  } else {
    console.log(JSON.stringify(receiptFor(plan), null, 2));
  }
  return 0;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
