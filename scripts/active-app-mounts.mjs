#!/usr/bin/env node
// Prints Web's active-mount list (NEXT_PUBLIC_TUTURUUU_ACTIVE_APP_MOUNTS):
// the app names of the mounts committed in apps/gateway/wrangler.jsonc,
// resolved through the shared-origin registry (packages/utils app-mounts.ts),
// aliases and the committed Apex activation included. Node only, no dependencies, so a fresh checkout can run
// it before `bun install`.
//
// Fails closed: a committed mount that resolves to no registered app and is
// not a known session-less mount exits non-zero, as does an empty list.
//
//   node scripts/active-app-mounts.mjs
//   node scripts/active-app-mounts.mjs --live <version.json>
//   node scripts/active-app-mounts.mjs --render-redirect
//
// `--live` takes a captured gateway version (the Workers versions API result,
// or its `result`) and exits non-zero unless every committed mount path is
// live, so a mount is never listed before the gateway routes it.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { APEX_MIGRATION } from './apex-migration.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const CONFIG = `${ROOT}apps/gateway/wrangler.jsonc`;
const REDIRECT_CONFIG = CONFIG.replace(
  /\.jsonc$/u,
  '.subdomain-redirect.jsonc'
);
const LIVE_REDIRECT_APPS = 'apps,mail,calendar,meet,tasks,finance';
const REGISTRY = `${ROOT}packages/utils/src/app-mounts.ts`;

// This CLI also runs from CommonJS-oriented checkouts. Read the one literal
// switch without loading the TypeScript module into the CLI's stderr stream.
const activation =
  /^export const APEX_MIGRATION_ACTIVE = (true|false);$/mu.exec(
    readFileSync(REGISTRY, 'utf8')
  );
if (!activation) throw new Error('Invalid Apex migration activation switch');
export const apexMigrationActive = activation[1] === 'true';

/**
 * Mounted Workers that have no `/<base>/verify-token` route (no signed-in
 * app, or none yet): Web never returns a login to them, so they are never
 * listed. Apps is a public catalogue; Tools moves out of this set once it
 * serves /tools/verify-token.
 */
export const SESSIONLESS_MOUNTS = new Set([
  '/roadmap',
  '/lms',
  '/tools',
  '/apps',
  '/external',
  '/playground',
]);

/**
 * Mounts the gateway routes before Web links to them. Web's switcher and
 * logins keep the app's subdomain until the mount passes signed-in
 * acceptance; the app's next change removes it here so Web lists it. A web
 * family can publish before the gateway in a production round, so listing a
 * mount in the same change as its gateway write could send Web links to a
 * path that is not live yet.
 */
const PENDING_WEB_MOUNTS = new Set(['/tasks']);

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
export function resolveActiveMounts(
  bases,
  registry,
  active = apexMigrationActive
) {
  const byBase = new Map();
  for (const app of Object.keys(registry.ONE_ORIGIN_APP_BASE_PATHS))
    for (const base of registry.getAppMountBasePaths(app))
      byBase.set(base, app);
  const apps = new Set();
  const unresolved = [];
  for (const base of bases) {
    if (
      SESSIONLESS_MOUNTS.has(base) ||
      (!active && PENDING_WEB_MOUNTS.has(base))
    )
      continue;
    const app = byBase.get(base);
    if (app) apps.add(app);
    else unresolved.push(base);
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

function addRouting(config, { flag, entries, prefix, values }) {
  const settings = new Set(config.vars[flag].split(',').filter(Boolean));
  const services = new Map(
    config.services.map((entry) => [entry.binding, entry])
  );
  for (const [app, service] of Object.entries(entries)) {
    for (const value of values(app)) settings.add(value);
    const binding = `${prefix}_${app.toUpperCase()}`;
    services.set(binding, { binding, service });
  }
  return {
    ...config,
    vars: { ...config.vars, [flag]: [...settings].join(',') },
    services: [...services.values()],
  };
}

/** Add the coordinated mount batch to a deployment only when activated. */
export function withApexGatewayConfig(config, active = apexMigrationActive) {
  return active
    ? addRouting(config, {
        flag: 'GATEWAY_MOUNTED_PATHS',
        entries: APEX_MIGRATION.mounts,
        prefix: 'MOUNT',
        values: (app) => [`/${app}`, `/${app}/*`],
      })
    : config;
}

/** Committed gateway routing after applying the shared activation switch. */
export function readCommittedConfig(active = apexMigrationActive) {
  return withApexGatewayConfig(
    parseJsonc(readFileSync(CONFIG, 'utf8')),
    active
  );
}

/** Legacy Worker config after applying the same activation switch. */
export function readRedirectConfig(active = apexMigrationActive) {
  const config = parseJsonc(readFileSync(REDIRECT_CONFIG, 'utf8'));
  config.vars.SUBDOMAIN_REDIRECT_APPS = LIVE_REDIRECT_APPS;
  return active
    ? addRouting(config, {
        flag: 'SUBDOMAIN_REDIRECT_APPS',
        entries: APEX_MIGRATION.legacyHosts,
        prefix: 'APP',
        values: (app) => [app],
      })
    : config;
}

async function main(argv) {
  const config = readCommittedConfig();
  if (argv.includes('--render-redirect')) {
    process.stdout.write(`${JSON.stringify(readRedirectConfig(), null, 2)}\n`);
    return;
  }
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
