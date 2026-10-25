#!/usr/bin/env node
// Read-only rollback capture before cutting a satellite subdomain over to its
// native Worker. Records DNS, the live edge, Vercel's current production
// deployment and (with a read-only Cloudflare token) the DNS record and
// Worker routes for the host. Writes JSON; never changes anything.
//
// Usage: node scripts/native-cutover/capture.mjs --host tasks.tuturuuu.com \
//          --vercel-project tasks [--vercel-scope tuturuuu] [--out file.json]
// Optional: --cf-zone-id <zone> with CLOUDFLARE_API_TOKEN (read-only; GET only).
import { spawnSync } from 'node:child_process';
import { promises as dns } from 'node:dns';
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    host: { type: 'string' },
    'vercel-project': { type: 'string' },
    'vercel-scope': { type: 'string', default: 'tuturuuu' },
    'cf-zone-id': { type: 'string' },
    out: { type: 'string' },
  },
});
if (!values.host || !values['vercel-project']) {
  console.error(
    'Usage: capture.mjs --host <host> --vercel-project <name> [--vercel-scope <team>] [--out <file>]'
  );
  process.exit(2);
}
const host = values.host;
// biome-ignore lint/suspicious/noUndeclaredEnvVars: operator credential for a manual ops script, not a Turbo task input.
const cloudflareToken = process.env.CLOUDFLARE_API_TOKEN;

async function settle(work) {
  try {
    return { ok: true, value: await work() };
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) };
  }
}

/** Vercel CLI output; it prints tables and inspect details to stderr. */
function vercel(args) {
  const result = spawnSync(
    'vercel',
    [...args, '--scope', values['vercel-scope']],
    {
      encoding: 'utf8',
      timeout: 60_000,
    }
  );
  if (result.status !== 0)
    throw new Error(result.stderr || `vercel ${args[0]} failed`);
  return `${result.stdout}\n${result.stderr}`;
}

async function cloudflare(path) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    headers: { authorization: `Bearer ${cloudflareToken}` },
  });
  const body = await response.json();
  if (!body.success) throw new Error(JSON.stringify(body.errors));
  return body.result;
}

const zoneId = values['cf-zone-id'];
const now = new Date();
const capture = {
  host,
  capturedAt: now.toISOString(),
  capturedAtGmt7: now.toLocaleString('en-GB', { timeZone: 'Asia/Ho_Chi_Minh' }),
  dns: {
    cname: await settle(() => dns.resolveCname(host)),
    a: await settle(() => dns.resolve4(host)),
    aaaa: await settle(() => dns.resolve6(host)),
    nameservers: await settle(() =>
      dns.resolveNs(host.split('.').slice(-2).join('.'))
    ),
  },
  edge: await settle(async () => {
    const response = await fetch(`https://${host}/robots.txt`, {
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
            cloudflare(`/zones/${zoneId}/dns_records?name=${host}`).then(
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
            cloudflare(`/zones/${zoneId}/workers/routes`).then((routes) =>
              routes.filter(
                (route) =>
                  route.pattern.startsWith(`${host}/`) || route.pattern === host
              )
            )
          ),
        }
      : {
          skipped:
            'pass --cf-zone-id with a read-only CLOUDFLARE_API_TOKEN to record the zone state',
        },
};

const json = `${JSON.stringify(capture, null, 2)}\n`;
if (values.out) writeFileSync(values.out, json);
process.stdout.write(json);
