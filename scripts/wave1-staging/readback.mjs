// biome-ignore-all lint/suspicious/noUndeclaredEnvVars: Direct CI/operator entrypoint; credentials never enter Turbo builds.
// Read-only staging ingress readback (staging-web-publisher design §9).
//
//   node scripts/wave1-staging/readback.mjs [--app web|calendar] [--expect-sha <sha>]
//
// Provider reads (R1–R3, N10 records, Access, workers.dev state) reuse the
// publisher's bounded topology preflight; HTTP probes (R4, N1–N5) carry no
// staff identity; N10 also checks live DNS. It performs no provider writes and
// prints a JSON report; any failed check exits 1. P5's verify-ingress runs it
// after publication and extends it with the Vercel checks (V1b, N15–N17).
import { pathToFileURL } from 'node:url';
import { observeIngress } from '../ci/wave1-ingress-preflight.mjs';
import {
  accessAppIds,
  evaluateIngress,
  ingressTargets,
} from '../ci/wave1-ingress-topology.mjs';
import { boundedJson } from '../ci/wave1-native-publish.mjs';
import {
  hostProbes,
  wildcardDnsProbe,
  workersDevProbes,
} from './readback-probes.mjs';

function option(argv, name) {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
}

/** R3: the active deployment is 100% one version carrying the expected SHA. */
export async function activeVersionCheck({
  request,
  token,
  accountId,
  target,
  expectedSha,
}) {
  const base = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${target.worker}`;
  try {
    const deployments = await request(`${base}/deployments`, token);
    const latest = deployments?.result?.deployments?.[0];
    const versions = latest?.versions ?? [];
    if (versions.length !== 1 || versions[0].percentage !== 100)
      return {
        id: 'R3',
        host: target.host,
        ok: false,
        detail: 'active deployment is not one version at 100%',
      };
    const version = await request(
      `${base}/versions/${versions[0].version_id}`,
      token
    );
    const message = version?.result?.annotations?.['workers/message'];
    const ok = !expectedSha || message === expectedSha;
    return {
      id: 'R3',
      host: target.host,
      ok,
      detail: `active version message ${message ?? 'missing'}`,
    };
  } catch (error) {
    return {
      id: 'R3',
      host: target.host,
      ok: false,
      detail: error instanceof Error ? error.message : 'read failed',
    };
  }
}

export async function readback({
  argv = process.argv.slice(2),
  env = process.env,
  fetcher = fetch,
  resolver,
} = {}) {
  const app = option(argv, '--app');
  const expectedSha = option(argv, '--expect-sha');
  const targets = ingressTargets().filter((t) => !app || t.app === app);
  if (!targets.length)
    throw new Error(`No ingress-admitted staging target for ${app}`);
  const token = env.CLOUDFLARE_STAGING_API_TOKEN;
  const accountId = env.CLOUDFLARE_STAGING_ACCOUNT_ID;
  if (!token || !/^[a-f0-9]{32}$/u.test(accountId ?? ''))
    throw new Error(
      'CLOUDFLARE_STAGING_API_TOKEN and CLOUDFLARE_STAGING_ACCOUNT_ID are required'
    );
  const request = (url, bearer) => boundedJson(url, bearer, fetcher);
  const appIds = accessAppIds(env.STAGING_ACCESS_APP_IDS);
  const serviceToken = {
    clientId: env.CF_ACCESS_HEALTH_CLIENT_ID,
    clientSecret: env.CF_ACCESS_HEALTH_CLIENT_SECRET,
  };
  const checks = [];
  for (const target of targets) {
    let failures;
    try {
      const appId = appIds[target.host];
      if (!appId)
        throw new Error(`No Access application recorded for ${target.host}`);
      failures = evaluateIngress(
        target,
        await observeIngress({
          request,
          token,
          accountId,
          zoneId: env.STAGING_TUTUR3U_ZONE_ID,
          target,
          appId,
        })
      );
    } catch (error) {
      failures = [
        error instanceof Error ? error.message : 'topology read failed',
      ];
    }
    checks.push({
      id: 'R1/R2/N10-records/Access',
      host: target.host,
      ok: failures.length === 0,
      detail: failures.join('; ') || 'topology admitted',
    });
    checks.push(
      await activeVersionCheck({
        request,
        token,
        accountId,
        target,
        expectedSha,
      })
    );
    checks.push(
      ...(await hostProbes({ target, fetcher, serviceToken, expectedSha }))
    );
    checks.push(
      ...(await workersDevProbes({
        target,
        subdomain: env.CLOUDFLARE_WORKERS_SUBDOMAIN,
        fetcher,
      }))
    );
  }
  checks.push(await wildcardDnsProbe(resolver ? { resolver } : {}));
  return { ok: checks.every((check) => check.ok), checks };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  readback()
    .then((report) => {
      console.log(JSON.stringify(report, null, 2));
      if (!report.ok) process.exitCode = 1;
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : 'Readback failed');
      process.exitCode = 1;
    });
}
