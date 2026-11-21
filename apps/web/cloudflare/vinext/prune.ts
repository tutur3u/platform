// Route pruning for one apps/web vinext family Worker build.
//
//   bun cloudflare/vinext/prune.ts <family>           dry run, prints the plan
//   bun cloudflare/vinext/prune.ts <family> --apply   deletes unowned entries
//
// Ownership, probe entries and the global deny list are the OpenNext family
// rules; only the family table differs. --apply runs only in a disposable
// checkout (the OpenNext marker file) and writes prune-receipt.json here.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  appRouteEntries,
  DEFAULT_APP_DIR,
  DISPOSABLE_MARKER,
  DISPOSABLE_MARKER_CONTENT,
  familyOwns,
  inSubtree,
  loadFamilies as loadOpenNextFamilies,
  type OpenNextFamily,
  PROBE_ENTRIES,
  type PrunePlan,
  receiptFor,
  routePathFor,
} from '../opennext/prune';

export interface VinextFamily extends OpenNextFamily {
  /** Owns every entry no other enabled family owns. */
  rest?: boolean;
}

export interface VinextFamilies {
  sharpExclude: string[];
  families: VinextFamily[];
}

export function loadVinextFamilies(appDir = DEFAULT_APP_DIR) {
  const raw = readFileSync(
    path.join(appDir, 'cloudflare/vinext/families.json'),
    'utf8'
  );
  return {
    config: JSON.parse(raw) as VinextFamilies,
    sha256: createHash('sha256').update(raw).digest('hex'),
  };
}

/** Kept and removed app entries (paths relative to src/app) for one family. */
export function planVinextPrune(
  familyId: string,
  appDir = DEFAULT_APP_DIR
): PrunePlan {
  const { config, sha256: familiesSha256 } = loadVinextFamilies(appDir);
  const { deny } = loadOpenNextFamilies(appDir).config;
  const family = config.families.find((candidate) => candidate.id === familyId);
  if (!family) throw new Error(`Unknown vinext family: ${familyId}`);
  if (!family.enabled) {
    throw new Error(`Family ${familyId} is declared but held: ${family.held}`);
  }
  const others = config.families.filter(
    (candidate) => candidate.enabled && !candidate.rest && candidate !== family
  );
  const owns = (routePath: string) => {
    if (!family.rest) return familyOwns(family, deny, routePath);
    if (deny.some((entry) => inSubtree(routePath, entry))) return false;
    if (config.sharpExclude.some((entry) => inSubtree(routePath, entry))) {
      return false;
    }
    return !others.some((other) => familyOwns(other, deny, routePath));
  };
  const keep: string[] = [];
  const remove: string[] = [];
  for (const rel of appRouteEntries(appDir)) {
    const routePath = routePathFor(rel);
    if (
      PROBE_ENTRIES.includes(rel) ||
      (routePath !== null && owns(routePath))
    ) {
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

/** Deletes the unowned entries. Refuses outside a disposable checkout. */
export function applyVinextPrune(plan: PrunePlan, appDir = DEFAULT_APP_DIR) {
  const marker = path.join(appDir, DISPOSABLE_MARKER);
  if (
    !existsSync(marker) ||
    readFileSync(marker, 'utf8') !== DISPOSABLE_MARKER_CONTENT
  ) {
    throw new Error(
      `Refusing to prune: ${marker} is missing. Prune runs only in a disposable checkout.`
    );
  }
  if (plan.keep.length === 0) {
    throw new Error(`Refusing to prune: family ${plan.family} owns no routes.`);
  }
  for (const rel of plan.remove) rmSync(path.join(appDir, 'src/app', rel));
  const receipt = receiptFor(plan);
  writeFileSync(
    path.join(appDir, 'cloudflare/vinext/prune-receipt.json'),
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
  const plan = planVinextPrune(familyId);
  if (flag === '--apply') {
    const receipt = applyVinextPrune(plan);
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
