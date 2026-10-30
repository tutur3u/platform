// Ingress-admitted staging topology (staging-web-publisher design §6.1).
//
// Pure evaluation of read-only Cloudflare observations for a staging Worker
// that serves one Access-protected Custom Domain. The publisher runs it before
// any ledger write or upload; readback.mjs runs it again after publication.
// Every check fails closed: an incomplete or ambiguous observation is a
// failure, never a pass.
import { matchesRoute } from '../native-cutover/route-pattern.mjs';
import { evaluatePolicies } from './wave1-ingress-policies.mjs';
import { profiles } from './wave1-native-profile.mjs';

export {
  ACCESS_PHASES,
  healthTokenIds,
  STAFF_EMAIL_DOMAIN,
  staffSelector,
} from './wave1-ingress-policies.mjs';

export const STAGING_ZONE = 'tutur3u.com';
export const STAGING_PARENT = 'staging.tutur3u.com';

/** Ingress-admitted staging identities, keyed by host. */
export function ingressTargets() {
  const targets = [];
  for (const [app, settings] of Object.entries(profiles.apps))
    if (settings.ingress === 'access-custom-domain')
      targets.push({
        app,
        host: settings.stagingHost,
        worker: settings.stagingWorker,
        issuer: false,
      });
  const web = profiles.webStaging;
  if (web?.ingress === 'access-custom-domain')
    targets.push({
      app: 'web',
      host: web.stagingHost,
      worker: web.stagingWorker,
      issuer: true,
    });
  return targets;
}

export function ingressTarget(app) {
  return ingressTargets().find((target) => target.app === app) ?? null;
}

/** Production Worker identities that must never hold a staging-zone binding. */
export function productionWorkers() {
  return Object.values(profiles.apps).map((app) => app.productionWorker);
}

const inZone = (hostname) =>
  hostname === STAGING_ZONE || hostname.endsWith(`.${STAGING_ZONE}`);

/**
 * A wildcard that could answer an unknown `<x>.staging.tutur3u.com` name.
 * The issuer trusts every single-label staging origin for CORS, which is safe
 * only while no wildcard can mint such a host (R1/N10).
 */
export function isStagingWildcard(name) {
  if (!name.startsWith('*')) return false;
  const base = name.replace(/^\*\.?/u, '');
  return (
    base === STAGING_PARENT ||
    base === STAGING_ZONE ||
    base.endsWith(`.${STAGING_PARENT}`) ||
    base === '' ||
    STAGING_PARENT.endsWith(`.${base}`)
  );
}

function routeHost(pattern) {
  return /^(?:https?:\/\/)?([^/]+)/iu.exec(pattern)?.[1]?.toLowerCase() ?? '';
}

/** The complete-list contract for a single-page Cloudflare list response. */
export function completeList(response, label) {
  const failures = [];
  if (response?.success !== true || !Array.isArray(response.result))
    failures.push(`${label}: observation failed`);
  else if (
    response.result.length >= 100 ||
    (response.result_info?.total_pages ?? 1) > 1
  )
    failures.push(`${label}: observation incomplete`);
  return failures;
}

/**
 * Evaluates one ingress target. `observed` holds the raw API results:
 * domains (account Custom Domains), routes (zone Worker routes), hostRecords
 * (DNS records named exactly the host), wildcardRecords (DNS records whose
 * name starts with `*`), app (Access application), policies (Access app
 * policies) and subdomain (workers.dev / preview serving).
 */
export function evaluateIngress(
  target,
  observed,
  { phase, staffGroupId, staffEmailListId, healthTokens } = {}
) {
  const failures = [];
  const { host, worker } = target;
  for (const [label, response] of [
    ['custom domains', observed.domains],
    ['zone routes', observed.routes],
    ['host DNS records', observed.hostRecords],
    ['wildcard DNS records', observed.wildcardRecords],
    ['Access policies', observed.policies],
  ])
    failures.push(...completeList(response, label));
  if (failures.length) return failures;

  // R1: the host binds only to its staging Worker, and nothing else holds it.
  const domains = observed.domains.result;
  const forHost = domains.filter((d) => d.hostname?.toLowerCase() === host);
  if (
    forHost.length !== 1 ||
    forHost[0].service !== worker ||
    forHost[0].zone_name !== STAGING_ZONE ||
    (forHost[0].environment ?? 'production') !== 'production'
  )
    failures.push(`R1: ${host} must bind exactly once to ${worker}`);
  const forWorker = domains.filter((d) => d.service === worker);
  if (forWorker.length !== 1 || forWorker[0].hostname?.toLowerCase() !== host)
    failures.push(`R1: ${worker} must hold only ${host}`);
  for (const production of productionWorkers())
    if (
      domains.some(
        (d) =>
          d.service === production && inZone(d.hostname?.toLowerCase() ?? '')
      )
    )
      failures.push(
        `R2: production ${production} holds a ${STAGING_ZONE} domain`
      );

  // R2: no zone route can capture either the host or an unknown staging host.
  for (const route of observed.routes.result) {
    const pattern = String(route.pattern ?? '');
    const routeTarget = routeHost(pattern);
    if (routeTarget.startsWith('*'))
      failures.push(`R2: wildcard route ${pattern} on ${STAGING_ZONE}`);
    else if (
      routeTarget === host ||
      matchesRoute(pattern, `https://${host}/`) ||
      matchesRoute(pattern, `http://${host}/`)
    )
      failures.push(`R2: route ${pattern} captures ${host}`);
  }

  // DNS (C3): every record named exactly the host must be the proxied,
  // Worker-managed Custom Domain record. A grey-cloud A/AAAA, a CNAME or any
  // other type could route around Access, and no record means no binding.
  const hostRecords = observed.hostRecords.result;
  if (!hostRecords.length)
    failures.push(`DNS: ${host} has no Custom Domain record`);
  for (const record of hostRecords)
    if (!workerManagedRecord(record, host))
      failures.push(
        `DNS: ${host} ${record.type ?? 'record'} is not the proxied Worker-managed Custom Domain record`
      );
  for (const record of observed.wildcardRecords.result)
    if (isStagingWildcard(String(record.name ?? '').toLowerCase()))
      failures.push(`N10: wildcard DNS record ${record.name} exists`);

  // Access: an enabled self-hosted app covering the whole host.
  const app = observed.app?.success === true ? observed.app.result : null;
  if (app?.type !== 'self_hosted')
    failures.push(`Access: ${host} has no self-hosted Access application`);
  else {
    const uris = [
      app.domain,
      ...(app.self_hosted_domains ?? []),
      ...(app.destinations ?? [])
        .filter((d) => d.type === undefined || d.type === 'public')
        .map((d) => d.uri),
    ]
      .filter(Boolean)
      .map((uri) =>
        String(uri)
          .toLowerCase()
          .replace(/^https?:\/\//u, '')
      );
    if (!uris.some((uri) => uri === host || uri === `${host}/*`))
      failures.push(`Access: application does not cover all of ${host}`);
    if (uris.some((uri) => !(uri === host || uri.startsWith(`${host}/`))))
      failures.push(`Access: application covers hosts other than ${host}`);
    if (Boolean(app.options_preflight_bypass) !== target.issuer)
      failures.push(
        `Access: OPTIONS preflight bypass must be ${target.issuer ? 'on' : 'off'} for ${host}`
      );
  }
  failures.push(
    ...evaluatePolicies(observed.policies.result, {
      phase,
      staffGroupId,
      staffEmailListId,
      healthTokens,
    })
  );

  // workers.dev and preview URLs stay off so Access cannot be bypassed.
  const serving =
    observed.subdomain?.success === true ? observed.subdomain.result : null;
  if (serving?.enabled !== false || serving.previews_enabled !== false)
    failures.push(`${worker}: workers.dev and preview URLs must be disabled`);
  return failures;
}

/** The proxied, read-only DNS record Cloudflare manages for a Custom Domain. */
export function workerManagedRecord(record, host) {
  return (
    String(record?.name ?? '').toLowerCase() === host &&
    ['A', 'AAAA'].includes(record.type) &&
    record.proxied === true &&
    record.meta?.read_only === true
  );
}

/** Parses `STAGING_ACCESS_APP_IDS`: a JSON object of host → Access app id. */
export function accessAppIds(value) {
  let parsed;
  try {
    parsed = JSON.parse(value ?? '');
  } catch {
    throw new Error(
      'STAGING_ACCESS_APP_IDS must be a JSON object of host to app id'
    );
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new Error(
      'STAGING_ACCESS_APP_IDS must be a JSON object of host to app id'
    );
  for (const [host, id] of Object.entries(parsed))
    if (
      !/^[a-f0-9-]{36}$/u.test(String(id)) ||
      !host.endsWith(`.${STAGING_PARENT}`)
    )
      throw new Error(`Invalid Access application entry for ${host}`);
  return parsed;
}
