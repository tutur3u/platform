import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Deploy config for the tuturuuu.com gateway (apps/gateway) built from the
// committed wrangler.jsonc and the serving Worker's version, so a CI deploy keeps
// what operators set on the live Worker:
// - plain-text vars: live values win over committed defaults, except mount
//   paths are merged and the family flag is set by the deploy. Both origin
//   overrides must match live.
// - service bindings: keep live and committed bindings and add flagged web
//   families;
// - secrets: not written here; a version upload inherits them. Every name in
//   the committed `secrets.required` must already be a live secret.
// Any other live binding type stops the deploy instead of being dropped.

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const ORIGIN_NAMES = ['WEB_ORIGIN', 'MARKETING_ORIGIN'];
const MOUNT_PATHS = 'GATEWAY_MOUNTED_PATHS';
const MOUNT_PATH_PATTERN = /^\/([a-z][a-z0-9-]*)(?:\/\*)?$/u;
const FORBIDDEN_NAMES = ['GATEWAY_ACCEPTANCE_HOST', 'VERCEL_PROTECTION_BYPASS'];
const KEPT_TYPES = new Set(['plain_text', 'secret_text', 'service']);
const VERSION_ID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u;

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

/**
 * Families GATEWAY_WEB_FAMILIES may name: the OpenNext families and the
 * vinext families (apps/web/cloudflare/vinext/families.json). A vinext family
 * replaces a disabled OpenNext family with the same id; both enabled is an
 * error, because they would share the WEB_FAMILY_<ID> binding.
 */
export function gatewayFamilies(openNext, vinext) {
  const vinextFamilies = vinext?.families ?? [];
  const ids = new Set(vinextFamilies.map((family) => family.id));
  if (ids.size !== vinextFamilies.length) {
    throw new Error('vinext family ids are not unique');
  }
  for (const family of openNext.families) {
    if (ids.has(family.id) && family.enabled) {
      throw new Error(
        `OpenNext family ${family.id} is enabled and also a vinext family`
      );
    }
  }
  return {
    ...openNext,
    families: [
      ...openNext.families.filter((family) => !ids.has(family.id)),
      ...vinextFamilies,
    ],
  };
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
 * @param {Array<{type: string, name: string, text?: string, service?: string, environment?: string, entrypoint?: string}>} liveBindings
 * @param {{families: Array<{id: string, enabled: boolean, worker: string}>}} families
 * @param {Record<string, string | undefined>} env
 */
export function deployConfig(base, liveBindings, families, env) {
  checkForbiddenNames(base, liveBindings, env);
  const vars = { ...base.vars };
  const services = new Map(
    (base.services ?? []).map((service) => [service.binding, service])
  );
  const committedMounts = parseFlagged(base.vars?.[MOUNT_PATHS]);
  for (const path of committedMounts) {
    const segment = MOUNT_PATH_PATTERN.exec(path)?.[1];
    if (!segment || segment === 'api') {
      throw new Error(`Invalid committed gateway mount path: ${path}`);
    }
    const binding = `MOUNT_${segment.toUpperCase().replaceAll('-', '_')}`;
    if (!services.get(binding)?.service) {
      throw new Error(`Committed gateway mount ${path} requires ${binding}`);
    }
  }
  for (const binding of liveBindings) {
    if (!KEPT_TYPES.has(binding.type)) {
      throw new Error(
        `Live gateway binding ${binding.name} has type ${binding.type}; add it to the deploy config before deploying from CI.`
      );
    }
    const { name, service, entrypoint } = binding;
    // Version readback names the default environment "production"; a binding
    // without an environment targets the same one.
    const environment =
      binding.environment === 'production' ? undefined : binding.environment;
    const committed = services.get(name);
    if (
      committed &&
      (binding.type !== 'service' ||
        committed.service !== service ||
        committed.environment !== environment ||
        committed.entrypoint !== entrypoint)
    ) {
      throw new Error(`Committed gateway service ${name} differs from live`);
    }
    if (binding.type === 'plain_text') vars[name] = binding.text ?? '';
    if (binding.type === 'service') {
      services.set(name, {
        binding: name,
        service,
        ...(environment === undefined ? {} : { environment }),
        ...(entrypoint === undefined ? {} : { entrypoint }),
      });
    }
  }
  const secrets = new Set(
    liveBindings.filter((b) => b.type === 'secret_text').map((b) => b.name)
  );
  for (const name of [...ORIGIN_NAMES, 'GATEWAY_WEB_FAMILIES', MOUNT_PATHS]) {
    if (secrets.has(name)) {
      throw new Error(
        `${name} is a live gateway secret; delete it before deploying it as a variable.`
      );
    }
  }
  for (const name of requiredSecrets(base)) {
    if (!secrets.has(name)) {
      throw new Error(
        `Live gateway secret ${name} is missing; set it before deploying.`
      );
    }
  }
  vars[MOUNT_PATHS] = parseFlagged(
    [...committedMounts, vars[MOUNT_PATHS]].join(',')
  ).join(',');
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
    // Routing traffic to a family needs a reviewed commit that marks it
    // activated; the variable alone cannot switch a family on.
    if (family.activated !== true) {
      throw new Error(
        'GATEWAY_WEB_FAMILIES contains a family that is not activated'
      );
    }
    const binding = familyBinding(id);
    services.set(binding, { binding, service: family.worker });
  }
  vars.GATEWAY_WEB_FAMILIES = flagged.join(',');
  const { routes: _routes, ...rest } = base;
  return {
    ...rest,
    vars,
    services: [...services.values()].sort((a, b) =>
      a.binding.localeCompare(b.binding)
    ),
  };
}

/**
 * The Worker a flagged family id names and the secret names it must hold: a
 * vinext family's `worker` and its table's `requiredSecrets`, or an OpenNext
 * family's `tuturuuu-web-<id>` and its committed Worker config.
 */
export function familySpec(id, openNext, vinext, root = ROOT) {
  if (!/^[a-z0-9-]+$/u.test(id)) throw new Error('invalid family id');
  const vinextFamily = vinext?.families?.find((family) => family.id === id);
  if (vinextFamily) {
    return {
      worker: vinextFamily.worker,
      required: vinext.requiredSecrets ?? [],
    };
  }
  const family = openNext.families.find((candidate) => candidate.id === id);
  const config = resolve(
    root,
    `apps/web/cloudflare/opennext/wrangler.${id}.jsonc`
  );
  if (!family || !existsSync(config)) {
    throw new Error(`${id} has no committed family Worker config`);
  }
  return {
    worker: `tuturuuu-web-${id}`,
    required: requiredSecrets(readJsonc(config)),
  };
}

/** Secret names a family's committed Worker config requires. */
export function requiredSecrets(config) {
  return config.secrets?.required ?? [];
}

async function gatewayRequest(resource) {
  const { CLOUDFLARE_ACCOUNT_ID: account, CLOUDFLARE_API_TOKEN: token } =
    process.env;
  if (!/^[a-f0-9]{32}$/u.test(account ?? '') || !token) {
    throw new Error('Cloudflare gateway account or API token is missing');
  }
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/tuturuuu-gateway${resource}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Cache-Control': 'no-cache',
      },
      signal: AbortSignal.timeout(20_000),
    }
  );
  if (!response.ok) {
    throw new Error(
      `Gateway read ${resource} failed with HTTP ${response.status}`
    );
  }
  const envelope = await response.json();
  if (!envelope.success) throw new Error(`Gateway read ${resource} failed`);
  return envelope.result;
}

async function servingGateway(request) {
  const deployment = (await request('/deployments'))?.deployments?.[0];
  const versions = deployment?.versions ?? [];
  const serving = versions.filter(({ percentage }) => percentage === 100);
  if (
    !VERSION_ID.test(deployment?.id ?? '') ||
    serving.length !== 1 ||
    !VERSION_ID.test(serving[0].version_id) ||
    versions.some(({ percentage }) => percentage !== 100 && percentage !== 0)
  ) {
    throw new Error('Expected exactly one gateway version serving 100%');
  }
  return { deploymentId: deployment.id, versionId: serving[0].version_id };
}

export async function assertServingGateway(snapshot, request = gatewayRequest) {
  const serving = await servingGateway(request);
  if (
    serving.deploymentId !== snapshot?.deploymentId ||
    serving.versionId !== snapshot?.versionId
  ) {
    throw new Error('Gateway deployment advanced since the captured preimage');
  }
}

export async function captureGatewaySettings(request = gatewayRequest) {
  const serving = await servingGateway(request);
  const version = await request(`/versions/${serving.versionId}`);
  const bindings = version?.resources?.bindings;
  if (version?.id !== serving.versionId || !Array.isArray(bindings)) {
    throw new Error(
      'Serving gateway version response has no matching bindings'
    );
  }
  await assertServingGateway(serving, request);
  return { success: true, result: { ...serving, bindings } };
}

async function main([command, ...args]) {
  if (command === 'capture') {
    const snapshot = await captureGatewaySettings();
    writeFileSync(args[0], `${JSON.stringify(snapshot, null, 2)}\n`, {
      mode: 0o600,
    });
    return 0;
  }
  if (command === 'assert-current') {
    const snapshot = JSON.parse(readFileSync(args[0], 'utf8'));
    await assertServingGateway(snapshot.result);
    return 0;
  }
  if (command === 'family-spec') {
    const read = (path) =>
      JSON.parse(readFileSync(resolve(ROOT, path), 'utf8'));
    console.log(
      JSON.stringify(
        familySpec(
          args[0] ?? '',
          read('apps/web/cloudflare/opennext/families.json'),
          read('apps/web/cloudflare/vinext/families.json')
        )
      )
    );
    return 0;
  }
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
      gatewayFamilies(
        JSON.parse(
          readFileSync(
            resolve(ROOT, 'apps/web/cloudflare/opennext/families.json'),
            'utf8'
          )
        ),
        JSON.parse(
          readFileSync(
            resolve(ROOT, 'apps/web/cloudflare/vinext/families.json'),
            'utf8'
          )
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
    'usage: gateway-deploy-config.mjs capture <settings.json> | assert-current <settings.json> | write <settings.json> <out.json> | required-secrets <wrangler.jsonc> | family-spec <id>'
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
