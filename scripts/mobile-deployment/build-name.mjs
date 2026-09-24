#!/usr/bin/env node
// biome-ignore-all lint/suspicious/noUndeclaredEnvVars: Protected store credentials are hydrated only inside the beta release job.
import { sign } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const appleOrigin = 'https://api.appstoreconnect.apple.com';
const bundleId = 'com.tuturuuu.app.mobile';

export function nextBuildName(pubspec, prereleaseVersions) {
  const source = pubspec.match(
    /^version:\s*(\d+)\.(\d+)\.(\d+)(?:\+\d+)?\s*$/mu
  );
  if (!source)
    throw new Error('Mobile pubspec version must be major.minor.patch');
  const [major, minor, sourcePatch] = source.slice(1).map(Number);
  const prefix = `${major}.${minor}.`;
  const patches = prereleaseVersions
    .filter(
      (version) => typeof version === 'string' && version.startsWith(prefix)
    )
    .map((version) => version.slice(prefix.length))
    .filter((patch) => /^\d+$/u.test(patch))
    .map(Number);
  return `${prefix}${Math.max(sourcePatch, 0, ...patches) + 1}`;
}

function appleToken(privateKey, keyId, issuerId) {
  const encode = (value) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const input = `${encode({ alg: 'ES256', kid: keyId, typ: 'JWT' })}.${encode({
    iss: issuerId,
    iat: now,
    exp: now + 600,
    aud: 'appstoreconnect-v1',
  })}`;
  const signature = sign('sha256', Buffer.from(input), {
    key: privateKey,
    dsaEncoding: 'ieee-p1363',
  });
  return `${input}.${signature.toString('base64url')}`;
}

export async function appleGet(path, credentials) {
  const response = await fetch(`${appleOrigin}${path}`, {
    headers: {
      Authorization: `Bearer ${appleToken(
        credentials.privateKey,
        credentials.keyId,
        credentials.issuerId
      )}`,
    },
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`App Store Connect lookup failed (${response.status})`);
  }
  return response.json();
}

export async function listIosPrereleaseVersionRecords(credentials) {
  const apps = await appleGet(
    `/v1/apps?${new URLSearchParams({ 'filter[bundleId]': bundleId, limit: '2' })}`,
    credentials
  );
  if (apps.data?.length !== 1) {
    throw new Error('Expected one App Store Connect app for the mobile bundle');
  }
  const versions = [];
  let path = `/v1/preReleaseVersions?${new URLSearchParams({
    'filter[app]': apps.data[0].id,
    'filter[platform]': 'IOS',
    limit: '200',
  })}`;
  while (path) {
    const page = await appleGet(path, credentials);
    versions.push(...(page.data ?? []));
    const next = page.links?.next;
    if (!next) break;
    const nextUrl = new URL(next);
    if (nextUrl.origin !== appleOrigin) {
      throw new Error('Unexpected App Store Connect pagination origin');
    }
    path = nextUrl.pathname + nextUrl.search;
  }
  return versions;
}

export async function listIosPrereleaseVersions(credentials) {
  const records = await listIosPrereleaseVersionRecords(credentials);
  return records.map((item) => item.attributes?.version);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const pubspec = await readFile(
      new URL('../../apps/mobile/pubspec.yaml', import.meta.url),
      'utf8'
    );
    const privateKey = await readFile(
      process.env.APP_STORE_CONNECT_PRIVATE_KEY_PATH,
      'utf8'
    );
    const versions = await listIosPrereleaseVersions({
      privateKey,
      keyId: process.env.APP_STORE_CONNECT_API_KEY_ID,
      issuerId: process.env.APP_STORE_CONNECT_ISSUER_ID,
    });
    process.stdout.write(nextBuildName(pubspec, versions));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
