#!/usr/bin/env node
// Prints Web's active-mount list (NEXT_PUBLIC_TUTURUUU_ACTIVE_APP_MOUNTS):
// the app names of the mounts committed in apps/gateway/wrangler.jsonc,
// resolved through the shared-origin registry (packages/utils app-mounts.ts),
// aliases included. Node only, no dependencies, so a fresh checkout can run
// it before `bun install`.
//
// Fails closed: a committed mount that resolves to no registered app and is
// not a known session-less mount exits non-zero, as does an empty list.
//
//   node scripts/active-app-mounts.mjs
//   node scripts/active-app-mounts.mjs --live <version.json>
//
// `--live` takes a captured gateway version (the Workers versions API result,
// or its `result`) and exits non-zero unless every committed mount path is
// live, so a mount is never listed before the gateway routes it.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const CONFIG = `${ROOT}apps/gateway/wrangler.jsonc`;
const REGISTRY = `${ROOT}packages/utils/src/app-mounts.ts`;

/**
 * Mounted Workers that serve no signed-in app: Web never returns a login to
 * them, so they are never listed.
 */
export const SESSIONLESS_MOUNTS = new Set(['/roadmap', '/lms']);

/** Parses JSONC: line and block comments and trailing commas. */
export function parseJsonc(text) {
  let out = '';
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      out += char;
      if (char === '\\') out += text[++i] ?? '';
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      out += char;
    } else if (char === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      out += '\n';
    } else if (char === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i++;
    } else out += char;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/gu, '$1'));
}

/** The committed mount bases, e.g. `/admin` for `/admin,/admin/*`. */
export function committedMountBases(config) {
  const paths = String(config.vars?.GATEWAY_MOUNTED_PATHS ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return [...new Set(paths.map((path) => path.replace(/\/\*$/u, '')))];
}

/** App names for `bases`, in registry order; throws on an unresolved base. */
export function resolveActiveMounts(bases, registry) {
  const byBase = new Map();
  for (const app of Object.keys(registry.ONE_ORIGIN_APP_BASE_PATHS))
    for (const base of registry.getAppMountBasePaths(app))
      byBase.set(base, app);
  const apps = new Set();
  const unresolved = [];
  for (const base of bases) {
    const app = byBase.get(base);
    if (app) apps.add(app);
    else if (!SESSIONLESS_MOUNTS.has(base)) unresolved.push(base);
  }
  if (unresolved.length)
    throw new Error(
      `Committed gateway mounts resolve to no registered app: ${unresolved.join(', ')}`
    );
  if (!apps.size) throw new Error('No committed mount resolves to an app');
  return Object.keys(registry.ONE_ORIGIN_APP_BASE_PATHS).filter((app) =>
    apps.has(app)
  );
}

/** Committed mount paths missing from a captured live gateway version. */
export function missingLivePaths(config, version) {
  const bindings = (version.result ?? version).bindings ?? [];
  const live = new Set(
    String(
      bindings.find((binding) => binding.name === 'GATEWAY_MOUNTED_PATHS')
        ?.text ?? ''
    )
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
  );
  return String(config.vars?.GATEWAY_MOUNTED_PATHS ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((path) => path && !live.has(path));
}

async function main(argv) {
  const config = parseJsonc(readFileSync(CONFIG, 'utf8'));
  const liveIndex = argv.indexOf('--live');
  if (liveIndex !== -1) {
    const file = argv[liveIndex + 1];
    if (!file) throw new Error('--live needs a captured version file');
    const missing = missingLivePaths(
      config,
      JSON.parse(readFileSync(file, 'utf8'))
    );
    if (missing.length)
      throw new Error(
        `Committed mounts are not live on the gateway: ${missing.join(', ')}`
      );
  }
  const registry = await import(REGISTRY);
  process.stdout.write(
    `${resolveActiveMounts(committedMountBases(config), registry).join(',')}\n`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
