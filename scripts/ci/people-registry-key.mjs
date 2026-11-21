#!/usr/bin/env node
// Operator CLI behind .github/workflows/people-registry-key.yaml. It mints the
// people registry's root wrap key once per kid, escrows it to the owners'
// age recipients before any Worker receives it, and never rotates a key in
// place, because existing wrapped workspace keys must stay readable.
//
//   plan <environment>                 targets, escrow object and recipients
//   preflight <environment> <kid>      destinations exist; kid and escrow unused
//   escrow <environment> <kid>         age ciphertext on stdin -> private R2
//   write <environment> <kid>          key hex on stdin -> Worker secrets
//   verify <environment> <kid>         name and type readback
//
// Each kid is its own Worker secret, PEOPLE_REGISTRY_WRAP_KEY_<kid>, and
// PEOPLE_REGISTRY_WRAP_KID names the current one, so a later kid is added
// without reading or rewriting earlier ones. Output names destinations and
// hashes of ciphertext, never a key. Credentials come from the environment by
// name: CLOUDFLARE_API_TOKEN (Worker secrets on the target Workers) and
// ESCROW_R2_TOKEN (object read and write on the escrow bucket only).
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  listWorkerSecrets,
  putWorkerSecret,
  readBack,
  workerExists,
} from './shared-secret-api.mjs';
import {
  CLOUDFLARE_ACCOUNT_ID,
  ENVIRONMENTS,
} from './shared-secret-targets.mjs';
import { signS3Request } from './s3-sigv4.mjs';

export const VINEXT_FAMILIES_FILE = 'apps/web/cloudflare/vinext/families.json';
/** Families that serve /api/v1/workspaces/{wsId}/people-registry/**. */
export const REGISTRY_FAMILIES = Object.freeze(['api-core']);
export const RECIPIENTS_FILE =
  '.github/escrow/people-registry-wrap-key.recipients';
export const ESCROW_BUCKET = 'tuturuuu-secret-escrow';
export const KID_BINDING = 'PEOPLE_REGISTRY_WRAP_KID';
export const keyBinding = (kid) => `PEOPLE_REGISTRY_WRAP_KEY_${kid}`;

const KID = /^[0-9a-f]{8}$/;
const KEY_HEX = /^[0-9a-f]{64}$/;
const WORKER_NAME = /^tuturuuu-[a-z0-9][a-z0-9-]{0,62}$/;
// age X25519 and post-quantum hybrid recipients (bech32 data alphabet).
const RECIPIENT = /^age1(pq1)?[02-9ac-hj-np-z]{40,4000}$/;
const ARMOR =
  /^-----BEGIN AGE ENCRYPTED FILE-----\n[\s\S]+\n-----END AGE ENCRYPTED FILE-----\n?$/;
// R2's S3-compatible endpoint. The escrow token is limited to object read and
// write on the escrow bucket, which Cloudflare honours only over the S3 API:
// the access key ID is the token's ID and the secret access key is the SHA-256
// hex of the token value.
const R2_S3 = `https://${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com/${ESCROW_BUCKET}`;
export const ESCROW_ACCESS_KEY_ID = '90c25a9c5b30c3b42b3849bb5d6ae166';
const TIMEOUT_MS = 30_000;

export function assertKid(kid) {
  assert.ok(
    typeof kid === 'string' && KID.test(kid),
    'kid must be 8 lowercase hex characters'
  );
  return kid;
}

export function readRecipients(root = '.') {
  const raw = readFileSync(join(root, RECIPIENTS_FILE), 'utf8');
  assert.ok(
    !/AGE-SECRET-KEY/i.test(raw),
    'escrow recipients file contains an identity'
  );
  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
  for (const line of lines)
    assert.ok(
      RECIPIENT.test(line),
      'escrow recipients file has an invalid line'
    );
  assert.ok(
    lines.length > 0,
    'no escrow recipient is committed; escrow is mandatory before minting'
  );
  assert.equal(new Set(lines).size, lines.length, 'escrow recipients repeat');
  return lines;
}

export function resolveTargets(environment, root = '.') {
  assert.ok(ENVIRONMENTS.includes(environment), 'unknown environment');
  const { families } = JSON.parse(
    readFileSync(join(root, VINEXT_FAMILIES_FILE), 'utf8')
  );
  assert.ok(Array.isArray(families), 'vinext family inventory has no families');
  return REGISTRY_FAMILIES.map((id) => {
    const family = families.find((entry) => entry?.id === id);
    assert.ok(family, `family ${id} is missing from the vinext inventory`);
    const name =
      environment === 'production' ? family.worker : `${family.worker}-staging`;
    assert.ok(
      typeof name === 'string' && WORKER_NAME.test(name),
      `invalid Worker name for ${id}`
    );
    return name;
  });
}

export const escrowKey = (environment, kid) =>
  `people-registry/${environment}/${assertKid(kid)}.age`;

async function r2(fetchImpl, token, key, { method = 'GET', body } = {}) {
  const url = `${R2_S3}/${key.split('/').map(encodeURIComponent).join('/')}`;
  const headers = signS3Request({
    method,
    url,
    headers:
      body !== undefined ? { 'content-type': 'application/octet-stream' } : {},
    body: body ?? '',
    accessKeyId: ESCROW_ACCESS_KEY_ID,
    secretAccessKey: createHash('sha256').update(token).digest('hex'),
    region: 'auto',
  });
  return fetchImpl(url, {
    method,
    redirect: 'error',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers,
    ...(body !== undefined && { body }),
  });
}

function requiredEnv(env, name) {
  assert.ok(env[name], `${name} is not set`);
  return env[name];
}

const SCRIPTS_API = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/workers/scripts`;

async function cfJson(fetchImpl, token, url, label) {
  const response = await fetchImpl(url, {
    method: 'GET',
    redirect: 'error',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
  });
  assert.ok(response.ok, `${label} failed with HTTP ${response.status}`);
  let body;
  try {
    body = await response.json();
  } catch {
    // A parse error can quote the body; drop it.
  }
  assert.ok(body && typeof body === 'object', `${label} returned no JSON`);
  return body;
}

/**
 * A secret write creates a new Worker version from the latest uploaded one
 * and deploys it, so the write is safe only when that latest version is the
 * one serving all traffic. Otherwise minting would roll out an unreviewed
 * build.
 */
export async function assertLatestIsDeployed({
  token,
  name,
  fetchImpl = fetch,
}) {
  const base = `${SCRIPTS_API}/${encodeURIComponent(name)}`;
  const deployments = await cfJson(
    fetchImpl,
    token,
    `${base}/deployments`,
    `deployment list on ${name}`
  );
  const active = deployments?.result?.deployments?.[0]?.versions;
  assert.ok(
    Array.isArray(active) &&
      active.length === 1 &&
      active[0]?.percentage === 100,
    `${name} is mid-rollout; wait for a single version at 100%`
  );
  const versions = await cfJson(
    fetchImpl,
    token,
    `${base}/versions`,
    `version list on ${name}`
  );
  const latest = versions?.result?.items?.[0]?.id;
  assert.ok(
    typeof latest === 'string' && latest === active[0]?.version_id,
    `${name} has an uploaded version that is not deployed`
  );
}

export async function preflight(
  environment,
  kid,
  { env, root = '.', fetchImpl = fetch, log }
) {
  assertKid(kid);
  const token = requiredEnv(env, 'CLOUDFLARE_API_TOKEN');
  log(`escrow recipients: ${readRecipients(root).length}`);
  for (const name of resolveTargets(environment, root)) {
    assert.ok(
      await workerExists({ token, name, fetchImpl }),
      `Worker ${name} does not exist`
    );
    await assertLatestIsDeployed({ token, name, fetchImpl });
    const names = (await listWorkerSecrets({ token, name, fetchImpl })).map(
      (entry) => entry.name
    );
    assert.ok(
      !names.includes(keyBinding(kid)),
      `${keyBinding(kid)} already exists on ${name}; a kid is minted once`
    );
    log(`worker ${name} present; kid ${kid} unused`);
  }
  const escrowToken = requiredEnv(env, 'ESCROW_R2_TOKEN');
  const existing = await r2(
    fetchImpl,
    escrowToken,
    escrowKey(environment, kid)
  );
  assert.equal(
    existing.status,
    404,
    `escrow object for kid ${kid} already exists or is unreadable (HTTP ${existing.status})`
  );
  log(`escrow ${ESCROW_BUCKET}/${escrowKey(environment, kid)} unused`);
}

/** Stores the age ciphertext and reads it back byte for byte before any mint. */
export async function escrow(
  environment,
  kid,
  armored,
  { env, root = '.', fetchImpl = fetch, log }
) {
  const token = requiredEnv(env, 'ESCROW_R2_TOKEN');
  readRecipients(root);
  assert.ok(
    typeof armored === 'string' && ARMOR.test(armored),
    'escrow input is not an armored age file'
  );
  const key = escrowKey(environment, kid);
  const put = await r2(fetchImpl, token, key, { method: 'PUT', body: armored });
  assert.ok(put.ok, `escrow write failed with HTTP ${put.status}`);
  const back = await r2(fetchImpl, token, key);
  assert.ok(back.ok, `escrow readback failed with HTTP ${back.status}`);
  const digest = (text) => createHash('sha256').update(text).digest('hex');
  assert.equal(
    digest(await back.text()),
    digest(armored),
    'escrow readback differs from the written ciphertext'
  );
  log(`escrowed ${ESCROW_BUCKET}/${key} sha256=${digest(armored)}`);
}

export async function write(
  environment,
  kid,
  keyHex,
  { env, root = '.', fetchImpl = fetch, log }
) {
  assertKid(kid);
  assert.ok(
    typeof keyHex === 'string' && KEY_HEX.test(keyHex),
    'key must be 64 lowercase hex characters'
  );
  const token = requiredEnv(env, 'CLOUDFLARE_API_TOKEN');
  for (const name of resolveTargets(environment, root)) {
    await assertLatestIsDeployed({ token, name, fetchImpl });
    await putWorkerSecret({
      token,
      name,
      binding: keyBinding(kid),
      value: keyHex,
      fetchImpl,
    });
    log(`wrote ${keyBinding(kid)} on ${name}`);
  }
}

/**
 * Points PEOPLE_REGISTRY_WRAP_KID at the new key only after every Worker holds
 * it. The kid is not secret; it is stored as a secret binding so it changes
 * without a code release. Like any secret write, this PUT deploys a version
 * built from the latest upload, so the deployment is re-checked immediately
 * before it. Response bodies are never printed.
 */
export async function activate(
  environment,
  kid,
  { env, root = '.', fetchImpl = fetch, log }
) {
  assertKid(kid);
  const token = requiredEnv(env, 'CLOUDFLARE_API_TOKEN');
  for (const name of resolveTargets(environment, root)) {
    // This PUT also deploys a version built from the latest upload.
    await assertLatestIsDeployed({ token, name, fetchImpl });
    const response = await fetchImpl(
      `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/workers/scripts/${encodeURIComponent(name)}/secrets`,
      {
        method: 'PUT',
        redirect: 'error',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          name: KID_BINDING,
          text: kid,
          type: 'secret_text',
        }),
      }
    );
    assert.ok(
      response.ok,
      `${KID_BINDING} write failed with HTTP ${response.status} on ${name}`
    );
    let body;
    try {
      body = await response.json();
    } catch {
      // A parse error can quote the body; drop it.
    }
    assert.ok(
      body?.success === true,
      `${KID_BINDING} write rejected on ${name}`
    );
    log(`set ${KID_BINDING}=${kid} on ${name}`);
  }
}

export async function verify(
  environment,
  kid,
  { env, root = '.', fetchImpl = fetch, log }
) {
  assertKid(kid);
  const token = requiredEnv(env, 'CLOUDFLARE_API_TOKEN');
  for (const name of resolveTargets(environment, root)) {
    await readBack(
      () => listWorkerSecrets({ token, name, fetchImpl }),
      (entries) => {
        for (const binding of [keyBinding(kid), KID_BINDING]) {
          const match = entries.filter((entry) => entry.name === binding);
          assert.equal(match.length, 1, `${binding} missing on ${name}`);
          assert.equal(
            match[0].type,
            'secret_text',
            `${binding} has the wrong type on ${name}`
          );
        }
      },
      { attempts: 5, delayMs: 3000 }
    );
    log(`verified ${keyBinding(kid)} and ${KID_BINDING} on ${name}`);
  }
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function main([command, environment, kid]) {
  const options = { env: process.env, log: (line) => console.log(line) };
  assert.ok(
    ENVIRONMENTS.includes(environment),
    'environment must be staging or production'
  );
  if (command === 'plan') {
    for (const name of resolveTargets(environment))
      console.log(`target ${name}`);
    console.log(`recipients ${readRecipients().length}`);
    return;
  }
  if (command === 'preflight') return preflight(environment, kid, options);
  if (command === 'escrow')
    return escrow(environment, kid, await readStdin(), options);
  if (command === 'write')
    return write(environment, kid, (await readStdin()).trim(), options);
  if (command === 'activate') return activate(environment, kid, options);
  if (command === 'verify') return verify(environment, kid, options);
  throw new Error(
    'usage: people-registry-key.mjs plan|preflight|escrow|write|activate|verify <environment> [kid]'
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : 'failed');
    process.exitCode = 1;
  });
}
