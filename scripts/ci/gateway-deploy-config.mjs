import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Deploy config for the tuturuuu.com gateway (apps/gateway) built from the
// committed wrangler.jsonc and the live Worker settings, so a CI deploy keeps
// what operators set on the live Worker:
// - plain-text vars: live values win over committed defaults, except the
//   names this deploy sets (WEB_ORIGIN, MARKETING_ORIGIN, GATEWAY_WEB_FAMILIES);
// - service bindings: live bindings are kept; every flagged web family gets
//   WEB_FAMILY_<ID> -> tuturuuu-web-<id>;
// - secrets: not written here; a version upload inherits them.
// Any other live binding type stops the deploy instead of being dropped.

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const ORIGIN_NAMES = ['WEB_ORIGIN', 'MARKETING_ORIGIN'];
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

/**
 * @param {object} base committed apps/gateway/wrangler.jsonc
 * @param {Array<{type: string, name: string, text?: string, service?: string}>} liveBindings
 * @param {{families: Array<{id: string, enabled: boolean, worker: string}>}} families
 * @param {Record<string, string | undefined>} env
 */
export function deployConfig(base, liveBindings, families, env) {
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
  for (const name of ORIGIN_NAMES) vars[name] = httpsOrigin(name, env[name]);
  const flagged = parseFlagged(env.GATEWAY_WEB_FAMILIES);
  for (const id of flagged) {
    const family = families.families.find((candidate) => candidate.id === id);
    if (!family?.enabled) {
      throw new Error(
        `GATEWAY_WEB_FAMILIES names ${id}, which is not an enabled family`
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
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
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
    writeFileSync(outPath, `${JSON.stringify(config, null, 2)}\n`);
    console.log(
      `vars: ${Object.keys(config.vars).sort().join(', ')}\nservices: ${config.services
        .map((s) => `${s.binding}->${s.service}`)
        .join(', ')}`
    );
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
