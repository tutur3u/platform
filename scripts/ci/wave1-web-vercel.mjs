// Read-only Vercel checks for the protected staging Next fallback
// (staging-web-publisher V1b, N15–N17 and Tess's serving-order gate).
//
// Nothing here creates, aliases, promotes or deletes a deployment. Secrets
// are compared, never printed; probe reports carry only status codes.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { probe } from '../wave1-staging/readback-probes.mjs';

export const VERCEL_API = 'https://api.vercel.com';
export const ATTESTATION_HEADER = 'x-tuturuuu-staging-supabase-ref';
export const STAGING_SUPABASE_REF = 'fxefojytwimjiqxseqag';

/**
 * Executable Next surfaces that Deployment Protection alone guards: the
 * proxy matcher excludes the image optimizer and the monitoring tunnel, so
 * the origin-proof gate never sees them. Each must be denied anonymously on
 * the deployment URL and on every alias before any serving step.
 */
export const ANONYMOUS_PATHS = [
  '/',
  '/login',
  '/api/v1/workspaces',
  '/_next/image?url=%2Ffavicon.ico&w=64&q=75',
  '/monitoring',
  '/monitoring?o=1&p=1',
];
/** Proxy-matched paths that must 403 with the bypass but no origin proof (N15). */
export const PROOF_PATHS = ['/login', '/api/v1/workspaces', '/'];

const sameSecret = (a, b) =>
  typeof a === 'string' &&
  typeof b === 'string' &&
  a.length === b.length &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** V1b: the project's protection settings, evaluated without echoing secrets. */
export function evaluateProtection(project, bypassSecret) {
  const failures = [];
  if (project?.ssoProtection?.deploymentType !== 'all')
    failures.push('V1b: Vercel Authentication must protect ALL deployments');
  if (project?.passwordProtection)
    failures.push('V1b: password protection must be off');
  if (project?.trustedIps) failures.push('V1b: trusted IPs must be off');
  if (project?.optionsAllowlist)
    failures.push('V1b: OPTIONS allowlist must be off');
  const bypasses = Object.entries(project?.protectionBypass ?? {});
  const automation = bypasses.filter(
    ([, value]) => value?.scope === 'automation-bypass'
  );
  if (bypasses.some(([, value]) => value?.scope !== 'automation-bypass'))
    failures.push(
      'V1b: shareable links or other protection bypasses must be off'
    );
  if (automation.length !== 1)
    failures.push('V1b: exactly one automation bypass secret is required');
  else if (!sameSecret(automation[0][0], bypassSecret))
    failures.push(
      'V1b: the automation bypass secret differs from the Worker secret'
    );
  return failures;
}

/** The deployment must be the exact READY, non-production staging build. */
export function evaluateDeployment(
  deployment,
  { projectId, sha, deploymentId }
) {
  const failures = [];
  if (deployment?.id !== deploymentId) failures.push('Deployment id differs');
  if (deployment?.projectId !== projectId)
    failures.push('Deployment belongs to another project');
  if (deployment?.readyState !== 'READY')
    failures.push('Deployment is not READY');
  if (deployment?.target === 'production')
    failures.push('Deployment target must never be production');
  if (deployment?.meta?.githubCommitSha !== sha)
    failures.push('Deployment SHA differs');
  if (
    !/^tuturuuu-web-staging-[a-z0-9-]+\.vercel\.app$/u.test(
      deployment?.url ?? ''
    )
  )
    failures.push('Deployment URL is not a tuturuuu-web-staging URL');
  return failures;
}

/**
 * Every hostname that can reach the deployment: its URL, its aliases and the
 * project's domains. Anything outside `*.vercel.app` is a forbidden domain.
 */
export function deploymentHosts({ deployment, aliases, domains }) {
  const failures = [];
  const hosts = new Set([deployment.url]);
  for (const alias of aliases?.aliases ?? [])
    hosts.add(String(alias.alias ?? '').toLowerCase());
  for (const name of deployment.alias ?? [])
    hosts.add(String(name).toLowerCase());
  for (const domain of domains?.domains ?? []) {
    const name = String(domain.name ?? '').toLowerCase();
    if (!name.endsWith('.vercel.app'))
      failures.push(`Project has a custom domain ${name}`);
    hosts.add(name);
  }
  hosts.delete('');
  if (
    (aliases?.aliases?.length ?? 0) >= 100 ||
    (domains?.domains?.length ?? 0) >= 100
  )
    failures.push('Alias or domain enumeration incomplete');
  return { hosts: [...hosts].sort(), failures };
}

/** Same format as `@tuturuuu/utils/abuse-protection/origin-ip-proof`. */
export function originProof(
  secret,
  ip,
  nowSeconds = Math.floor(Date.now() / 1000)
) {
  const mac = createHmac('sha256', secret)
    .update(`tuturuuu-origin-client-ip/v1\n${nowSeconds}\n${ip}`)
    .digest('hex');
  return `hmac-v1;${nowSeconds};${ip};${mac}`;
}

function vercelDenied(result) {
  if (result.status === 401 || result.status === 403) return true;
  if (result.status >= 300 && result.status < 400) {
    try {
      const host = new URL(result.location).hostname;
      return host === 'vercel.com' || host.endsWith('.vercel.com');
    } catch {
      return false;
    }
  }
  return false;
}
const vercelCookie = (result) =>
  result.setCookie.some((c) => /^\s*_vercel/iu.test(c));

/**
 * Anonymous (N16 plus `_next/image` and monitoring), bypass-without-proof
 * (N15) and bypass-cookie (N17) probes on every host. With `proofSecret`, one
 * bypass+proof request must also carry the staging attestation.
 */
export async function vercelProbes({
  hosts,
  fetcher,
  bypassSecret,
  proofSecret,
}) {
  const checks = [];
  for (const host of hosts) {
    for (const path of ANONYMOUS_PATHS) {
      const result = await probe(fetcher, `https://${host}${path}`);
      checks.push({
        id: 'N16',
        host,
        ok: vercelDenied(result) && !vercelCookie(result),
        detail: `${path} -> ${result.status || result.error}`,
      });
    }
    for (const path of PROOF_PATHS) {
      const result = await probe(fetcher, `https://${host}${path}`, {
        headers: { 'x-vercel-protection-bypass': bypassSecret },
      });
      checks.push({
        id: 'N15',
        host,
        ok: result.status === 403,
        detail: `${path} with bypass, no proof -> ${result.status || result.error}`,
      });
      checks.push({
        id: 'N17',
        host,
        ok: !vercelCookie(result),
        detail: `${path} sets no _vercel cookie without a bypass-cookie request`,
      });
    }
  }
  if (proofSecret && hosts.length) {
    const result = await probe(fetcher, `https://${hosts[0]}/login`, {
      headers: {
        'x-vercel-protection-bypass': bypassSecret,
        'x-tuturuuu-origin-auth': originProof(proofSecret, '203.0.113.10'),
        'x-forwarded-for': '203.0.113.10',
      },
    });
    checks.push({
      id: 'attestation',
      host: hosts[0],
      ok:
        result.status > 0 &&
        result.status < 500 &&
        result.headers?.get?.(ATTESTATION_HEADER) === STAGING_SUPABASE_REF &&
        !vercelCookie(result),
      detail: `relayed /login -> ${result.status || result.error}`,
    });
  }
  return checks;
}
