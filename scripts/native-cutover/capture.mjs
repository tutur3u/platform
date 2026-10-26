#!/usr/bin/env node
// Read-only rollback capture before cutting a satellite subdomain over to its
// native Worker. Records DNS, the live edge, Vercel's current production
// deployment and (with a read-only Cloudflare token) the DNS record and
// all Worker routes for the zone. Writes JSON; never changes anything.
//
// Usage: node scripts/native-cutover/capture.mjs --host tasks.tuturuuu.com \
//          --vercel-project tasks [--vercel-scope tuturuuu] [--out tmp/capture.json]
// Optional: --cf-zone-id <zone> with CLOUDFLARE_READONLY_API_TOKEN (read-only; GET only).
import { spawnSync } from 'node:child_process';
import { promises as dns } from 'node:dns';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const HOSTNAME =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?(?![\s\S])/iu;
const STDERR_LIMIT = 2_000;

export function validateCaptureOptions(values) {
  if (!HOSTNAME.test(values.host ?? ''))
    throw new Error('--host must be a DNS hostname');
  if (!values['vercel-project'])
    throw new Error('--vercel-project is required');
  if (
    values['cf-zone-id'] !== undefined &&
    (!/^[0-9a-f]{32}$/u.test(values['cf-zone-id']) ||
      values['cf-zone-id'].length !== 32)
  )
    throw new Error('--cf-zone-id must be 32 lowercase hexadecimal characters');
}

async function settle(work) {
  try {
    return { ok: true, value: await work() };
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) };
  }
}

/** Collect without writes; dependencies allow tests without provider access. */
export async function captureState(
  values,
  {
    fetchImpl = fetch,
    dnsImpl = dns,
    spawnImpl = spawnSync,
    env = process.env,
  } = {}
) {
  validateCaptureOptions(values);
  const host = values.host.toLowerCase();
  const cloudflareToken = env.CLOUDFLARE_READONLY_API_TOKEN;
  const redact = (value) =>
    cloudflareToken ? value.replaceAll(cloudflareToken, '[REDACTED]') : value;

  function vercel(args) {
    const result = spawnImpl(
      'vercel',
      [...args, '--scope', values['vercel-scope'] ?? 'tuturuuu'],
      { encoding: 'utf8', timeout: 60_000 }
    );
    const stderr = redact(result.stderr ?? '');
    if (result.status !== 0)
      throw new Error(
        stderr.slice(0, STDERR_LIMIT) || `vercel ${args[0]} failed`
      );
    return `${result.stdout ?? ''}\n${stderr}`;
  }

  async function cloudflare(path, query) {
    // Do not retain upstream error text: transports and APIs can echo headers.
    try {
      const url = new URL(`https://api.cloudflare.com/client/v4${path}`);
      if (query) url.search = new URLSearchParams(query).toString();
      const response = await fetchImpl(url.href, {
        headers: { authorization: `Bearer ${cloudflareToken}` },
        redirect: 'error',
      });
      const body = await response.json();
      if (!response.ok || !body.success)
        throw new Error('Cloudflare API request failed');
      return body.result;
    } catch {
      throw new Error('Cloudflare API request failed');
    }
  }

  const zoneId = values['cf-zone-id'];
  const now = new Date();
  const capture = {
    host,
    capturedAt: now.toISOString(),
    capturedAtGmt7: now.toLocaleString('en-GB', {
      timeZone: 'Asia/Ho_Chi_Minh',
    }),
    dns: {
      cname: await settle(() => dnsImpl.resolveCname(host)),
      a: await settle(() => dnsImpl.resolve4(host)),
      aaaa: await settle(() => dnsImpl.resolve6(host)),
      nameservers: await settle(() =>
        dnsImpl.resolveNs(host.split('.').slice(-2).join('.'))
      ),
    },
    edge: await settle(async () => {
      const response = await fetchImpl(`https://${host}/robots.txt`, {
        redirect: 'manual',
      });
      const pick = ['server', 'x-vercel-id', 'cf-ray', 'x-tuturuuu-runtime'];
      return {
        status: response.status,
        headers: Object.fromEntries(
          pick.map((name) => [name, response.headers.get(name)])
        ),
      };
    }),
    vercel: await settle(async () => {
      const listing = vercel(['ls', values['vercel-project'], '--prod']);
      const deployments = [
        ...listing.matchAll(/https:\/\/[a-z0-9-]+\.vercel\.app/gu),
      ].map((match) => match[0]);
      const current = deployments[0];
      if (!current) throw new Error('no production deployment found');
      const inspect = vercel(['inspect', current]);
      return {
        currentProduction: current,
        deploymentId: /\bid\s+(dpl_\w+)/u.exec(inspect)?.[1] ?? null,
        created: /created\s+([^\n[]+)/u.exec(inspect)?.[1]?.trim() ?? null,
        previousProduction: deployments.slice(1, 4),
      };
    }),
    cloudflare:
      cloudflareToken && zoneId
        ? {
            dnsRecords: await settle(() =>
              cloudflare(`/zones/${zoneId}/dns_records`, { name: host }).then(
                (records) =>
                  records.map(({ id, type, content, proxied, ttl }) => ({
                    id,
                    type,
                    content,
                    proxied,
                    ttl,
                  }))
              )
            ),
            workerRoutes: await settle(() =>
              cloudflare(`/zones/${zoneId}/workers/routes`)
            ),
          }
        : {
            skipped:
              'pass --cf-zone-id with a read-only CLOUDFLARE_READONLY_API_TOKEN to record the zone state',
          },
  };

  // Redact even a provider/CLI response that unexpectedly echoes the credential.
  return JSON.parse(
    JSON.stringify(capture, (_key, value) =>
      typeof value === 'string' ? redact(value) : value
    )
  );
}

export async function main(args = process.argv.slice(2)) {
  const { values } = parseArgs({
    args,
    options: {
      host: { type: 'string' },
      'vercel-project': { type: 'string' },
      'vercel-scope': { type: 'string', default: 'tuturuuu' },
      'cf-zone-id': { type: 'string' },
      out: { type: 'string' },
    },
  });
  const capture = await captureState(values);
  const json = `${JSON.stringify(capture, null, 2)}\n`;
  if (values.out) writeFileSync(values.out, json);
  process.stdout.write(json);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch(() => {
    console.error(
      'Capture failed; check hostname, zone ID, project and output path.'
    );
    process.exitCode = 2;
  });
}
