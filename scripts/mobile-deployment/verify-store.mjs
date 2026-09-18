#!/usr/bin/env node
// biome-ignore-all lint/suspicious/noUndeclaredEnvVars: Standalone uncached release step; signing credentials never enter Turbo's cache.
import { sign } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

const APP_ID = 'com.tuturuuu.app.mobile';
const APPLE_ORIGIN = 'https://api.appstoreconnect.apple.com';
const GOOGLE_ORIGIN = 'https://androidpublisher.googleapis.com';

function jwt(header, claims, key) {
  const encode = (value) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const input = `${encode(header)}.${encode(claims)}`;
  const signature = sign('sha256', Buffer.from(input), {
    key,
    ...(header.alg === 'ES256' ? { dsaEncoding: 'ieee-p1363' } : {}),
  });
  return `${input}.${signature.toString('base64url')}`;
}

async function json(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    // Store error payloads may contain account data. Keep CI diagnostics bounded.
    throw new Error(
      `Store API request failed (${response.status}, ${new URL(url).pathname})`
    );
  }
  return response.status === 204 ? null : response.json();
}

export function playReleaseReady(track, buildNumber) {
  return (
    track.track === 'internal' &&
    track.releases?.some(
      (release) =>
        release.status === 'completed' &&
        release.versionCodes?.includes(String(buildNumber))
    ) === true
  );
}

export function testFlightReady(build, betaDetail) {
  return (
    build?.attributes?.processingState === 'VALID' &&
    build.attributes.expired !== true &&
    betaDetail?.attributes?.internalBuildState === 'IN_BETA_TESTING'
  );
}

export async function verifyPlay(buildNumber) {
  const account = JSON.parse(
    await readFile(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_PATH, 'utf8')
  );
  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt(
    { alg: 'RS256', typ: 'JWT' },
    {
      iss: account.client_email,
      scope: 'https://www.googleapis.com/auth/androidpublisher',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 600,
    },
    account.private_key
  );
  const token = await json('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const headers = {
    Authorization: `Bearer ${token.access_token}`,
    'Content-Type': 'application/json',
  };
  const base = `${GOOGLE_ORIGIN}/androidpublisher/v3/applications/${APP_ID}/edits`;
  const edit = await json(base, { method: 'POST', headers, body: '{}' });
  const editUrl = `${base}/${encodeURIComponent(edit.id)}`;
  try {
    const track = await json(`${editUrl}/tracks/internal`, { headers });
    if (!playReleaseReady(track, buildNumber)) {
      throw new Error(
        `Build ${buildNumber} is not a completed Google Play internal release`
      );
    }
  } finally {
    // A verification edit is never committed and cannot publish another release.
    await json(editUrl, { method: 'DELETE', headers });
  }
  console.log(
    `Verified Google Play internal build ${buildNumber} for ${APP_ID}.`
  );
}

export async function verifyTestFlight(buildNumber) {
  const key = await readFile(
    process.env.APP_STORE_CONNECT_PRIVATE_KEY_PATH,
    'utf8'
  );
  const apple = (path) => {
    const now = Math.floor(Date.now() / 1000);
    const token = jwt(
      {
        alg: 'ES256',
        kid: process.env.APP_STORE_CONNECT_API_KEY_ID,
        typ: 'JWT',
      },
      {
        iss: process.env.APP_STORE_CONNECT_ISSUER_ID,
        iat: now,
        exp: now + 600,
        aud: 'appstoreconnect-v1',
      },
      key
    );
    return json(`${APPLE_ORIGIN}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  };
  const apps = await apple(
    `/v1/apps?${new URLSearchParams({ 'filter[bundleId]': APP_ID, limit: '2' })}`
  );
  if (apps.data?.length !== 1)
    throw new Error(
      'Expected exactly one App Store Connect app with the production bundle id'
    );
  const appId = apps.data[0].id;
  const query = new URLSearchParams({
    'filter[app]': appId,
    'filter[version]': String(buildNumber),
    include: 'buildBetaDetail',
    limit: '2',
  });
  const deadline = Date.now() + 30 * 60_000;
  while (Date.now() < deadline) {
    const builds = await apple(`/v1/builds?${query}`);
    if (builds.data?.length > 1)
      throw new Error('Build number is ambiguous across app versions');
    const build = builds.data?.[0];
    const state = build?.attributes?.processingState ?? 'NOT_VISIBLE';
    if (['FAILED', 'INVALID'].includes(state))
      throw new Error(`Apple rejected build ${buildNumber}: ${state}`);
    const detailId = build?.relationships?.buildBetaDetail?.data?.id;
    const detail = builds.included?.find(
      (item) => item.type === 'buildBetaDetails' && item.id === detailId
    );
    if (testFlightReady(build, detail)) {
      console.log(
        `Verified TestFlight internal testing for build ${buildNumber} (${build.id}).`
      );
      return;
    }
    console.log(
      `Waiting for TestFlight build ${buildNumber}: ${state}, ${detail?.attributes?.internalBuildState ?? 'NO_BETA_STATE'}`
    );
    await delay(30_000);
  }
  throw new Error(
    'TestFlight is not available for internal testing after 30 minutes. Check processing, export compliance, and automatic distribution to the existing internal tester group.'
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const [platform, buildNumber] = process.argv.slice(2);
    if (!/^[1-9]\d*$/.test(buildNumber ?? ''))
      throw new Error('A numeric build number is required');
    if (platform === 'android') await verifyPlay(buildNumber);
    else if (platform === 'ios') await verifyTestFlight(buildNumber);
    else throw new Error('Expected android or ios');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
