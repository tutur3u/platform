// Behavior of scripts/ci/people-registry-key.mjs and the static contract of
// .github/workflows/people-registry-key.yaml. Fetch is injected; no request
// leaves the process.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  activate,
  escrow,
  ESCROW_ACCESS_KEY_ID,
  escrowKey,
  keyBinding,
  preflight,
  readRecipients,
  RECIPIENTS_FILE,
  resolveTargets,
  VINEXT_FAMILIES_FILE,
  verify,
  write,
} from './people-registry-key.mjs';
import { CLOUDFLARE_ACCOUNT_ID } from './shared-secret-targets.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '../..');
const RECIPIENT = `age1${'q'.repeat(58)}`;
const ARMORED =
  '-----BEGIN AGE ENCRYPTED FILE-----\nYWdl\n-----END AGE ENCRYPTED FILE-----\n';
const KID = '0a1b2c3d';
const KEY = 'ab'.repeat(32);
const ESCROW_HOST = `${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`;
/** True when a request goes to the escrow bucket's exact S3 origin. */
const isEscrowUrl = (value) => {
  const url = new URL(value);
  return url.protocol === 'https:' && url.hostname === ESCROW_HOST;
};

function fixture({ recipients = [RECIPIENT] } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'prk-'));
  mkdirSync(join(root, dirname(RECIPIENTS_FILE)), { recursive: true });
  writeFileSync(
    join(root, RECIPIENTS_FILE),
    ['# comment', ...recipients, ''].join('\n')
  );
  mkdirSync(join(root, dirname(VINEXT_FAMILIES_FILE)), { recursive: true });
  writeFileSync(
    join(root, VINEXT_FAMILIES_FILE),
    JSON.stringify({
      families: [{ id: 'api-core', worker: 'tuturuuu-web-vinext-api-core' }],
    })
  );
  return root;
}

/** A fake Cloudflare: Worker secrets and an R2 bucket, recording requests. */
function cloudflare({
  secrets = {},
  objects = {},
  failPut = false,
  deployed = [{ version_id: 'v2', percentage: 100 }],
  latest = 'v2',
  objectStatus = null,
  corruptReadback = false,
  rejectKid = false,
} = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, method: init.method ?? 'GET', body: init.body });
    const json = (status, body) =>
      new Response(JSON.stringify(body), { status });
    const r2 = url.match(
      /^https:\/\/[0-9a-f]+\.r2\.cloudflarestorage\.com\/tuturuuu-secret-escrow\/(.+)$/
    );
    if (r2) {
      const key = r2[1].split('/').map(decodeURIComponent).join('/');
      if (init.method === 'PUT') {
        if (failPut) return new Response('', { status: 500 });
        objects[key] = init.body;
        return new Response('', { status: 200 });
      }
      if (objectStatus) return new Response('', { status: objectStatus });
      return key in objects
        ? new Response(corruptReadback ? `${objects[key]}x` : objects[key], {
            status: 200,
          })
        : new Response('', { status: 404 });
    }
    const worker = url.match(
      /\/workers\/scripts\/([^/]+)\/(settings|secrets|deployments|versions)$/
    );
    assert.ok(worker, `unexpected URL ${url}`);
    const name = decodeURIComponent(worker[1]);
    if (worker[2] === 'deployments')
      return json(200, { result: { deployments: [{ versions: deployed }] } });
    if (worker[2] === 'versions')
      return json(200, { result: { items: [{ id: latest }] } });
    if (worker[2] === 'settings') return json(name in secrets ? 200 : 404, {});
    if (init.method === 'PUT') {
      const { name: binding, type } = JSON.parse(init.body);
      if (rejectKid && binding === 'PEOPLE_REGISTRY_WRAP_KID')
        return json(200, { success: false, errors: [] });
      secrets[name].push({ name: binding, type });
      return json(200, { success: true, result: {} });
    }
    return json(200, { success: true, result: secrets[name] });
  };
  return { fetchImpl, calls, secrets, objects };
}

const env = { CLOUDFLARE_API_TOKEN: 'token', ESCROW_R2_TOKEN: 'escrow-token' };
const quiet = { env, log: () => {} };

test('targets the api-core Worker per environment', () => {
  const root = fixture();
  assert.deepEqual(resolveTargets('production', root), [
    'tuturuuu-web-vinext-api-core',
  ]);
  assert.deepEqual(resolveTargets('staging', root), [
    'tuturuuu-web-vinext-api-core-staging',
  ]);
});

test('refuses to run without a committed escrow recipient or with an invalid one', () => {
  assert.throws(
    () => readRecipients(fixture({ recipients: [] })),
    /escrow is mandatory/
  );
  assert.throws(
    () => readRecipients(fixture({ recipients: ['AGE-SECRET-KEY-1ABC'] })),
    /contains an identity/
  );
  assert.throws(
    () => readRecipients(fixture({ recipients: ['ssh-ed25519 AAAA'] })),
    /invalid line/
  );
  assert.deepEqual(readRecipients(fixture()), [RECIPIENT]);
});

test('the committed recipients file passes the identity scan', () => {
  // With no recipient committed yet, the only refusal is the missing recipient.
  try {
    readRecipients(repoRoot);
  } catch (error) {
    assert.match(String(error?.message), /escrow is mandatory/);
  }
});

test('preflight refuses a used kid or an existing escrow object', async () => {
  const root = fixture();
  const fresh = cloudflare({ secrets: { 'tuturuuu-web-vinext-api-core': [] } });
  await preflight('production', KID, {
    ...quiet,
    root,
    fetchImpl: fresh.fetchImpl,
  });
  const used = cloudflare({
    secrets: {
      'tuturuuu-web-vinext-api-core': [
        { name: keyBinding(KID), type: 'secret_text' },
      ],
    },
  });
  await assert.rejects(
    preflight('production', KID, { ...quiet, root, fetchImpl: used.fetchImpl }),
    /minted once/
  );
  const escrowed = cloudflare({
    secrets: { 'tuturuuu-web-vinext-api-core': [] },
    objects: { [escrowKey('production', KID)]: ARMORED },
  });
  await assert.rejects(
    preflight('production', KID, {
      ...quiet,
      root,
      fetchImpl: escrowed.fetchImpl,
    }),
    /already exists/
  );
  const missing = cloudflare({ secrets: {} });
  await assert.rejects(
    preflight('production', KID, {
      ...quiet,
      root,
      fetchImpl: missing.fetchImpl,
    }),
    /does not exist/
  );
  await assert.rejects(
    preflight('production', 'ZZ', {
      ...quiet,
      root,
      fetchImpl: fresh.fetchImpl,
    }),
    /kid/
  );
});

test('refuses to write while a rollout is in progress or an upload is not deployed', async () => {
  const root = fixture();
  const midRollout = cloudflare({
    secrets: { 'tuturuuu-web-vinext-api-core': [] },
    deployed: [
      { version_id: 'v1', percentage: 50 },
      { version_id: 'v2', percentage: 50 },
    ],
  });
  await assert.rejects(
    preflight('production', KID, {
      ...quiet,
      root,
      fetchImpl: midRollout.fetchImpl,
    }),
    /mid-rollout/
  );
  const undeployed = cloudflare({
    secrets: { 'tuturuuu-web-vinext-api-core': [] },
    latest: 'v3',
  });
  await assert.rejects(
    preflight('production', KID, {
      ...quiet,
      root,
      fetchImpl: undeployed.fetchImpl,
    }),
    /not deployed/
  );
  await assert.rejects(
    write('production', KID, KEY, {
      ...quiet,
      root,
      fetchImpl: undeployed.fetchImpl,
    }),
    /not deployed/
  );
  assert.equal(undeployed.secrets['tuturuuu-web-vinext-api-core'].length, 0);
});

test('escrow stores and reads back the exact ciphertext, and rejects plaintext', async () => {
  const root = fixture();
  const cf = cloudflare();
  await escrow('staging', KID, ARMORED, {
    ...quiet,
    root,
    fetchImpl: cf.fetchImpl,
  });
  assert.equal(cf.objects[escrowKey('staging', KID)], ARMORED);
  await assert.rejects(
    escrow('staging', KID, KEY, {
      ...quiet,
      root,
      fetchImpl: cloudflare().fetchImpl,
    }),
    /armored age/
  );
  await assert.rejects(
    escrow('staging', KID, ARMORED, {
      ...quiet,
      root,
      fetchImpl: cloudflare({ failPut: true }).fetchImpl,
    }),
    /escrow write failed/
  );
});

test('writes the per-kid key, activates the kid and verifies both, never logging the key', async () => {
  const root = fixture();
  const cf = cloudflare({ secrets: { 'tuturuuu-web-vinext-api-core': [] } });
  const lines = [];
  const options = {
    env,
    root,
    fetchImpl: cf.fetchImpl,
    log: (line) => lines.push(line),
  };
  await write('production', KID, KEY, options);
  await activate('production', KID, options);
  await verify('production', KID, options);
  assert.deepEqual(
    cf.secrets['tuturuuu-web-vinext-api-core'].map((s) => s.name),
    [keyBinding(KID), 'PEOPLE_REGISTRY_WRAP_KID']
  );
  assert.ok(!lines.join('\n').includes(KEY));
  assert.ok(cf.calls.every((call) => !call.url.includes(KEY)));
  await assert.rejects(
    write('production', KID, 'short', options),
    /64 lowercase hex/
  );
});

test('escrow never exposes the token or its SHA-256 in URLs or logs', async () => {
  const { createHash } = await import('node:crypto');
  const root = fixture();
  const cf = cloudflare();
  const lines = [];
  await escrow('production', KID, ARMORED, {
    env,
    root,
    fetchImpl: cf.fetchImpl,
    log: (l) => lines.push(l),
  });
  const digest = createHash('sha256').update(env.ESCROW_R2_TOKEN).digest('hex');
  for (const text of [...cf.calls.map((c) => c.url), ...lines]) {
    assert.ok(!text.includes(digest) && !text.includes(env.ESCROW_R2_TOKEN));
  }
});

test('escrow uses only the dedicated escrow token', async () => {
  const root = fixture();
  const cf = cloudflare();
  const seen = [];
  const fetchImpl = (url, init) => {
    seen.push([isEscrowUrl(url), init.headers.authorization]);
    return cf.fetchImpl(url, init);
  };
  await escrow('staging', KID, ARMORED, { ...quiet, root, fetchImpl });
  assert.ok(seen.some(([r2]) => r2));
  assert.ok(
    seen.every(
      ([r2, auth]) =>
        !r2 ||
        (auth.startsWith(
          `AWS4-HMAC-SHA256 Credential=${ESCROW_ACCESS_KEY_ID}/`
        ) &&
          !auth.includes('escrow-token'))
    )
  );
  await assert.rejects(
    escrow('staging', KID, ARMORED, {
      env: { CLOUDFLARE_API_TOKEN: 'token' },
      log: () => {},
      root,
      fetchImpl,
    }),
    /ESCROW_R2_TOKEN is not set/
  );
});

test('the workflow escrows before writing, is protected and pins age', () => {
  const text = readFileSync(
    join(repoRoot, '.github/workflows/people-registry-key.yaml'),
    'utf8'
  );
  const order = [
    'people-registry-key.mjs preflight',
    'age --armor',
    'people-registry-key.mjs escrow',
    'people-registry-key.mjs write',
    'people-registry-key.mjs activate',
    'people-registry-key.mjs verify',
  ];
  const run = text.slice(
    text.indexOf('- name: Mint, escrow, write and activate')
  );
  const positions = order.map((needle) => run.indexOf(needle));
  assert.ok(
    positions.every((p) => p >= 0),
    'workflow is missing a step'
  );
  assert.deepEqual(
    [...positions].sort((a, b) => a - b),
    positions,
    'escrow must precede the Worker write'
  );
  assert.match(text, /environment: shared-secret-production/);
  assert.match(text, /if: github\.ref == 'refs\/heads\/main'/);
  assert.match(
    text,
    /cbe24006683f8eb669266162894b9a522a1af52f2665fbc63a4bb032ed26ac10 {2}\$archive" \| sha256sum -c -/
  );
  assert.match(text, /workflow_dispatch:/);
  assert.ok(!/\bon:\s*\n\s*(push|pull_request)/.test(text));
});

test('escrow objects keep literal slashes in their path', async () => {
  const root = fixture();
  const cf = cloudflare();
  await escrow('production', KID, ARMORED, {
    ...quiet,
    root,
    fetchImpl: cf.fetchImpl,
  });
  const urls = cf.calls.map((c) => c.url).filter(isEscrowUrl);
  assert.ok(urls.length >= 2);
  for (const url of urls) {
    assert.equal(
      new URL(url).pathname,
      `/tuturuuu-secret-escrow/people-registry/production/${KID}.age`
    );
    assert.ok(!/%2F/i.test(url));
  }
});

test('escrow refuses a readback that differs from what was written', async () => {
  const root = fixture();
  await assert.rejects(
    escrow('production', KID, ARMORED, {
      ...quiet,
      root,
      fetchImpl: cloudflare({ corruptReadback: true }).fetchImpl,
    }),
    /readback differs/
  );
});

test('preflight refuses when the escrow bucket answers 401, 403 or 500', async () => {
  const root = fixture();
  for (const objectStatus of [401, 403, 500]) {
    const cf = cloudflare({
      secrets: { 'tuturuuu-web-vinext-api-core': [] },
      objectStatus,
    });
    await assert.rejects(
      preflight('production', KID, { ...quiet, root, fetchImpl: cf.fetchImpl }),
      /already exists or is unreadable/
    );
  }
});

test('activate requires the provider to report success', async () => {
  const root = fixture();
  const cf = cloudflare({
    secrets: { 'tuturuuu-web-vinext-api-core': [] },
    rejectKid: true,
  });
  await assert.rejects(
    activate('production', KID, { ...quiet, root, fetchImpl: cf.fetchImpl }),
    /rejected/
  );
});

test('an identity anywhere in the recipients file is refused, even in a comment', () => {
  const root = fixture();
  writeFileSync(
    join(root, RECIPIENTS_FILE),
    `# AGE-SECRET-KEY-1${'Q'.repeat(58)}\n${RECIPIENT}\n`
  );
  assert.throws(() => readRecipients(root), /contains an identity/);
});

test('activate refuses when the latest upload is not the deployed version', async () => {
  const root = fixture();
  const cf = cloudflare({
    secrets: { 'tuturuuu-web-vinext-api-core': [] },
    latest: 'v3',
  });
  await assert.rejects(
    activate('production', KID, { ...quiet, root, fetchImpl: cf.fetchImpl }),
    /not deployed/
  );
  assert.equal(cf.secrets['tuturuuu-web-vinext-api-core'].length, 0);
});
