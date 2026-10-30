// Read-only Cloudflare observation and serving-intent gate for ingress-admitted
// staging Workers (design §6.1). Bounded reads only; no provider writes.
import assert from 'node:assert/strict';
import {
  accessAppIds,
  evaluateIngress,
  ingressTarget,
} from './wave1-ingress-topology.mjs';

const api = 'https://api.cloudflare.com/client/v4';

export async function observeIngress({
  request,
  token,
  accountId,
  zoneId,
  target,
  appId,
}) {
  assert.match(
    zoneId ?? '',
    /^[a-f0-9]{32}$/u,
    'STAGING_TUTUR3U_ZONE_ID is required'
  );
  const account = `${api}/accounts/${accountId}`;
  const zone = `${api}/zones/${zoneId}`;
  const host = encodeURIComponent(target.host);
  return {
    domains: await request(`${account}/workers/domains`, token),
    routes: await request(`${zone}/workers/routes`, token),
    hostRecords: await request(
      `${zone}/dns_records?per_page=100&name.exact=${host}`,
      token
    ),
    wildcardRecords: await request(
      `${zone}/dns_records?per_page=100&name.startswith=${encodeURIComponent('*')}`,
      token
    ),
    app: await request(`${account}/access/apps/${appId}`, token),
    policies: await request(
      `${account}/access/apps/${appId}/policies?per_page=100`,
      token
    ),
    subdomain: await request(
      `${account}/workers/scripts/${target.worker}/subdomain`,
      token
    ),
  };
}

/** Fresh GitHub read of the durable serving intent (S0). Only `on` admits. */
export async function assertServingIntent({ request, ghToken, repository }) {
  const intent = await request(
    `https://api.github.com/repos/${repository}/actions/variables/WEB_STAGING_SERVING`,
    ghToken
  );
  assert.equal(
    intent?.value,
    'on',
    'Staging serving intent is off (WEB_STAGING_SERVING)'
  );
}

/**
 * Runs before any ledger write or upload. Returns null for apps outside the
 * ingress class, so no-ingress staging publication is unchanged.
 */
export async function ingressPreflight({
  app,
  env,
  request,
  cfToken,
  ghToken,
  accountId,
}) {
  const target = ingressTarget(app);
  if (!target) return null;
  await assertServingIntent({
    request,
    ghToken,
    repository: env.GITHUB_REPOSITORY,
  });
  const appId = accessAppIds(env.STAGING_ACCESS_APP_IDS)[target.host];
  assert.ok(appId, `No Access application recorded for ${target.host}`);
  const observed = await observeIngress({
    request,
    token: cfToken,
    accountId,
    zoneId: env.STAGING_TUTUR3U_ZONE_ID,
    target,
    appId,
  });
  const failures = evaluateIngress(target, observed, {
    staffGroupId: env.STAGING_ACCESS_STAFF_GROUP_ID,
    staffEmailListId: env.STAGING_ACCESS_STAFF_EMAIL_LIST_ID,
  });
  assert.deepEqual(
    failures,
    [],
    `Ingress topology refused:\n${failures.join('\n')}`
  );
  return { target, appId };
}
