#!/usr/bin/env node
// Local workerd acceptance for the Mail Worker. It starts the emitted Worker in
// process (the same `unstable_startWorker` path as scripts/ci/wave1-native-runtime.mjs),
// answers its outbound fetches itself, and drives login, inbox, thread, compose,
// paste shapes, send, attachments and inline CID images against a staging
// Supabase project and a fleet-owned fixture mailbox. Values come from the
// environment at run time; the evidence file holds names, statuses and hashes.
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createEvidence } from './evidence.mjs';
import { createFakeS3 } from './fake-s3.mjs';
import { buildInboundFixtures } from './fixtures.mjs';
import { CookieJar } from './session.mjs';
import { composeSteps } from './steps-compose.mjs';
import { readSteps } from './steps-read.mjs';

// Public identifier of the production Supabase project; never a credential.
const PRODUCTION_SUPABASE_REF = 'nzamlzqfdwaaxdefwraj';
const FIXTURE_VALUE = 'local-acceptance-fixture';

const optional = (name, fallback) => process.env[name] || fallback;
const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};

function configuration() {
  const supabaseUrl = required('NEXT_PUBLIC_SUPABASE_URL');
  if (new URL(supabaseUrl).hostname.startsWith(PRODUCTION_SUPABASE_REF))
    throw new Error('Refusing to run against the production Supabase project');
  if (process.env.CLOUDFLARE_API_TOKEN)
    throw new Error('No Cloudflare provider credential may be present');
  if (!required('MAIL_CLOUDFLARE_API_TOKEN').startsWith('inert-staging-'))
    throw new Error('MAIL_CLOUDFLARE_API_TOKEN must be the inert placeholder');
  const domain = required('MAIL_ACCEPT_DOMAIN').toLowerCase();
  return {
    runId: randomUUID().replaceAll('-', '').slice(0, 12),
    appRoot: resolve(optional('MAIL_ACCEPT_APP_ROOT', 'apps/mail')),
    profile: optional('MAIL_ACCEPT_PROFILE', 'production'),
    sha: required('MAIL_ACCEPT_SHA'),
    wsId: optional('MAIL_ACCEPT_WS_ID', 'personal'),
    domain,
    mailbox: required('MAIL_ACCEPT_MAILBOX_ADDRESS').toLowerCase(),
    recipient: optional(
      'MAIL_ACCEPT_RECIPIENT',
      `acceptance-recipient@${domain}`
    ),
    ingestSecret: required('MAIL_CLOUDFLARE_INGEST_SECRET'),
    bucket: optional('MAIL_R2_BUCKET_NAME', 'tuturuuu-mail-wave1-staging'),
    evidencePath: resolve(
      optional('MAIL_ACCEPT_EVIDENCE', 'mail-acceptance-evidence.json')
    ),
    supabaseUrl,
    login: {
      supabaseUrl,
      publishableKey: required('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
      email: required('MAIL_ACCEPT_LOGIN_EMAIL'),
      password: required('MAIL_ACCEPT_LOGIN_PASSWORD'),
    },
  };
}

async function main() {
  const cfg = configuration();
  // The sealed-artifact verifier is the repository CLI; it fails the run when
  // the emitted bytes differ from the receipt.
  const repoRoot = resolve(cfg.appRoot, '..', '..');
  execFileSync(
    process.execPath,
    [
      join(repoRoot, 'scripts', 'ci', 'wave1-native-artifact.mjs'),
      'verify',
      'mail',
      cfg.profile,
      cfg.sha,
    ],
    { cwd: repoRoot, stdio: 'inherit' }
  );
  const receipt = JSON.parse(
    readFileSync(join(cfg.appRoot, 'wave1-artifact.json'), 'utf8')
  );
  const host = optional('MAIL_ACCEPT_HOST', receipt.profile.host);
  const endpoint = 'https://s3.acceptance.invalid';
  const s3 = createFakeS3({ endpointHost: new URL(endpoint).hostname });
  const provider = { calls: 0, sawInertToken: false };
  const egress = { supabase: 0, denied: [] };
  const supabaseHost = new URL(cfg.supabaseUrl).hostname;

  const scratch = await mkdtemp(join(tmpdir(), 'mail-acceptance-'));
  await cp(join(cfg.appRoot, 'dist'), join(scratch, 'dist'), {
    recursive: true,
  });
  await writeFile(join(scratch, 'empty.env'), '');
  const { unstable_startWorker } = createRequire(
    resolve(cfg.appRoot, 'package.json')
  )('wrangler');

  const secretValue = (name) =>
    process.env[name] ??
    (name.startsWith('MAIL_R2_') || name === 'MAIL_CLOUDFLARE_ACCOUNT_ID'
      ? FIXTURE_VALUE
      : required(name));
  const worker = await unstable_startWorker({
    config: join(scratch, 'dist/wave1/wrangler.json'),
    envFiles: [join(scratch, 'empty.env')],
    sendMetrics: false,
    bindings: {
      ...Object.fromEntries(
        receipt.profile.secrets.map((name) => [
          name,
          { type: 'secret_text', value: secretValue(name) },
        ])
      ),
      MAIL_R2_ENDPOINT: { type: 'plain_text', value: endpoint },
      MAIL_R2_BUCKET_NAME: { type: 'plain_text', value: cfg.bucket },
    },
    build: { bundle: false, processEntrypoint: false },
    dev: {
      remote: false,
      watch: false,
      persist: false,
      inspector: false,
      liveReload: false,
      generateTypes: false,
      enableContainers: false,
      registry: join(scratch, 'registry'),
      server: { hostname: '127.0.0.1', port: 0 },
      origin: { hostname: host, secure: true },
      inferOriginFromRoutes: false,
      routeRequestsByRoutes: false,
      auth: () => {
        throw new Error('Provider auth forbidden');
      },
      // Everything the Worker fetches is decided here: the object store and the
      // Cloudflare send API are in-process fixtures, Supabase is the one real
      // supplier, and any other host is denied and reported.
      outboundService: async (request) => {
        const url = new URL(request.url);
        if (s3.matches(url)) return s3.handle(request);
        if (url.hostname === supabaseHost) {
          egress.supabase += 1;
          return fetch(request);
        }
        if (
          url.hostname === 'api.cloudflare.com' &&
          /\/email\/sending\/send$/u.test(url.pathname)
        ) {
          provider.calls += 1;
          provider.sawInertToken = (
            request.headers.get('authorization') ?? ''
          ).startsWith('Bearer inert-staging-');
          return Response.json(
            {
              success: false,
              errors: [{ code: 10000, message: 'Authentication error' }],
              result: null,
            },
            { status: 401 }
          );
        }
        egress.denied.push(url.hostname);
        return new Response('Egress denied', { status: 599 });
      },
    },
  });
  await worker.ready;

  const jar = new CookieJar();
  const call = async (
    path,
    { method = 'GET', json, raw, form, headers = {}, cookies = true } = {}
  ) => {
    const init = {
      method,
      redirect: 'manual',
      headers: {
        origin: `https://${host}`,
        'x-tuturuuu-client': 'mail-acceptance',
        ...headers,
      },
    };
    if (cookies && jar.header()) init.headers.cookie = jar.header();
    if (json !== undefined) {
      init.body = JSON.stringify(json);
      init.headers['content-type'] = 'application/json';
    }
    if (raw !== undefined) init.body = raw;
    if (form) init.body = form;
    const response = await worker.fetch(`https://${host}${path}`, init);
    jar.absorb(response);
    return response;
  };

  const ev = createEvidence({
    app: 'mail',
    sha: cfg.sha,
    profile: cfg.profile,
    runId: cfg.runId,
    workerHost: host,
    supabaseHost,
    node: process.version,
  });
  const harness = {
    ev,
    call,
    jar,
    cfg,
    ctx: {},
    s3,
    provider,
    fixtures: buildInboundFixtures({
      runId: cfg.runId,
      domain: cfg.domain,
      mailbox: cfg.mailbox,
      bucket: cfg.bucket,
    }),
  };
  try {
    await readSteps(harness);
    await composeSteps(harness);
    await ev.step('egress stayed inside the declared boundary', async () => {
      if (egress.denied.length)
        throw new Error(
          `denied hosts: ${[...new Set(egress.denied)].join(',')}`
        );
      return {
        supabaseRequests: egress.supabase,
        providerCalls: provider.calls,
      };
    });
  } finally {
    await worker.dispose();
    await rm(scratch, { recursive: true, force: true });
  }
  const evidence = await ev.write(cfg.evidencePath, {
    objectStore: s3.stats(),
    egress: {
      supabaseRequests: egress.supabase,
      providerCalls: provider.calls,
      deniedHosts: [...new Set(egress.denied)],
    },
  });
  console.log(
    `${evidence.failed === 0 ? 'ACCEPTED' : 'REJECTED'} ${evidence.passed} passed, ${evidence.failed} failed: ${cfg.evidencePath}`
  );
  process.exitCode = evidence.failed === 0 ? 0 : 1;
}

await main();
