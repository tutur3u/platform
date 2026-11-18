import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Deploy config for the tuturuuu.com gateway (apps/gateway) built from the
// committed wrangler.jsonc and the live Worker settings, so a CI deploy keeps
// what operators set on the live Worker:
// - plain-text vars: live values win over committed defaults, except the
//   family flag this deploy sets. Both origin overrides must match live.
// - service bindings: live bindings are kept; every flagged web family gets
//   WEB_FAMILY_<ID> -> tuturuuu-web-<id>;
// - secrets: not written here; a version upload inherits them.
// Any other live binding type stops the deploy instead of being dropped.

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const ORIGIN_NAMES = ['WEB_ORIGIN', 'MARKETING_ORIGIN'];
const FORBIDDEN_NAMES = ['GATEWAY_ACCEPTANCE_HOST', 'VERCEL_PROTECTION_BYPASS'];
const KEPT_TYPES = new Set(['plain_text', 'secret_text', 'service']);

export function stripJsonComments(text) {
  return text
    .replace(
      /("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//gu,
      (match, string) => string ?? ''
    )
    .replace(/,(\s*[}\]])/gu, '$1');
}

export function readJsonc(path) {
  return JSON.parse(stripJsonComments(readFileSync(path, 'utf8')));
}

export function familyBinding(id) {
  return `WEB_FAMILY_${id.toUpperCase().replaceAll('-', '_')}`;
}

export function parseFlagged(value) {
  return [
    ...new Set(
      (value ?? '')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
    ),
  ];
}

function httpsOrigin(name, value) {
  let url;
  try {
    url = new URL(value ?? '');
  } catch {
    throw new Error(`${name} must be an https origin`);
  }
  if (
    url.protocol !== 'https:' ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error(`${name} must be an https origin`);
  }
  return url.origin;
}

function configContainsName(value, name) {
  if (value === name) return true;
  if (value === null || typeof value !== 'object') return false;
  return Object.entries(value).some(
    ([key, entry]) => key === name || configContainsName(entry, name)
  );
}

function checkForbiddenNames(base, liveBindings, env) {
  const forbidden = FORBIDDEN_NAMES.filter(
    (name) =>
      Object.hasOwn(env, name) ||
      liveBindings.some((binding) => binding.name === name) ||
      configContainsName(base, name)
  );
  if (forbidden.length > 0) {
    throw new Error(forbidden.map((name) => `${name} is set`).join('\n'));
  }
}

/**
 * @param {object} base committed apps/gateway/wrangler.jsonc
 * @param {Array<{type: string, name: string, text?: string, service?: string}>} liveBindings
 * @param {{families: Array<{id: string, enabled: boolean, worker: string}>}} families
 * @param {Record<string, string | undefined>} env
 */
export function deployConfig(base, liveBindings, families, env) {
  checkForbiddenNames(base, liveBindings, env);
  const vars = { ...base.vars };
  const services = new Map();
  for (const binding of liveBindings) {
    if (!KEPT_TYPES.has(binding.type)) {
      throw new Error(
        `Live gateway binding ${binding.name} has type ${binding.type}; add it to the deploy config before deploying from CI.`
      );
    }
    if (binding.type === 'plain_text') vars[binding.name] = binding.text ?? '';
    if (binding.type === 'service') services.set(binding.name, binding.service);
  }
  const secrets = new Set(
    liveBindings.filter((b) => b.type === 'secret_text').map((b) => b.name)
  );
  for (const name of [...ORIGIN_NAMES, 'GATEWAY_WEB_FAMILIES']) {
    if (secrets.has(name)) {
      throw new Error(
        `${name} is a live gateway secret; delete it before deploying it as a variable.`
      );
    }
  }
  for (const name of ORIGIN_NAMES) {
    const origin = httpsOrigin(name, env[name]);
    const live = liveBindings.filter((binding) => binding.name === name);
    if (
      live.length !== 1 ||
      live[0].type !== 'plain_text' ||
      live[0].text !== origin
    ) {
      throw new Error(`${name} differs from live`);
    }
    vars[name] = origin;
  }
  const flagged = parseFlagged(env.GATEWAY_WEB_FAMILIES);
  for (const id of flagged) {
    const family = families.families.find((candidate) => candidate.id === id);
    if (!family?.enabled) {
      throw new Error(
        'GATEWAY_WEB_FAMILIES contains an id that is not an enabled family'
      );
    }
    services.set(familyBinding(id), family.worker);
  }
  vars.GATEWAY_WEB_FAMILIES = flagged.join(',');
  const { routes: _routes, ...rest } = base;
  return {
    ...rest,
    vars,
    services: [...services]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([binding, service]) => ({ binding, service })),
  };
}

/** Secret names a family's committed wrangler config requires. */
export function requiredSecrets(config) {
  return config.secrets?.required ?? [];
}

function main([command, ...args]) {
  if (command === 'required-secrets') {
    console.log(JSON.stringify(requiredSecrets(readJsonc(args[0]))));
    return 0;
  }
  if (command === 'write') {
    const [settingsPath, outPath] = args;
    let settings;
    try {
      settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    } catch {
      throw new Error('Cannot read live gateway settings JSON');
    }
    if (!settings.success || !Array.isArray(settings.result?.bindings)) {
      throw new Error('Live gateway settings response has no bindings');
    }
    const config = deployConfig(
      readJsonc(resolve(ROOT, 'apps/gateway/wrangler.jsonc')),
      settings.result.bindings,
      JSON.parse(
        readFileSync(
          resolve(ROOT, 'apps/web/cloudflare/opennext/families.json'),
          'utf8'
        )
      ),
      process.env
    );
    console.log(`GATEWAY_WEB_FAMILIES=${config.vars.GATEWAY_WEB_FAMILIES}`);
    for (const name of FORBIDDEN_NAMES) console.log(`${name}=unset`);
    writeFileSync(outPath, `${JSON.stringify(config, null, 2)}\n`);
    return 0;
  }
  throw new Error(
    'usage: gateway-deploy-config.mjs write <settings.json> <out.json> | required-secrets <wrangler.jsonc>'
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
