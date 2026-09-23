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

export function selectBetaGroups(groups, enabled, configuredGroups) {
  if (enabled === 'false') return [];
  if (enabled !== 'true') {
    throw new Error('TESTFLIGHT_BETA_ENABLED must be true or false');
  }
  const names = configuredGroups.trim();
  if (!names || names === 'all') return groups;
  const selected = new Set(
    names
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean)
  );
  const matches = groups.filter(
    (group) => selected.has(group.id) || selected.has(group.attributes?.name)
  );
  for (const name of selected) {
    if (
      !matches.some(
        (group) => group.id === name || group.attributes?.name === name
      )
    ) {
      throw new Error(`Unknown TestFlight beta group: ${name}`);
    }
  }
  return matches;
}

async function listAppleResources(apple, path) {
  const resources = [];
  let next = path;
  while (next) {
    const page = await apple(next);
    resources.push(...(page.data ?? []));
    const nextUrl = page.links?.next;
    if (nextUrl && new URL(nextUrl).origin !== APPLE_ORIGIN) {
      throw new Error('Unexpected App Store Connect pagination origin');
    }
    next = nextUrl ? new URL(nextUrl).pathname + new URL(nextUrl).search : null;
  }
  return resources;
}

export async function distributeTestFlightBuild(apple, appId, buildId, config) {
  if (config.enabled === 'false') {
    console.log('Automatic TestFlight group distribution is disabled.');
    return [];
  }
  const groups = await listAppleResources(
    apple,
    `/v1/apps/${appId}/betaGroups?limit=200`
  );
  const selected = selectBetaGroups(groups, config.enabled, config.groups);
  if (selected.length === 0) {
    throw new Error('No TestFlight beta groups are available for this app');
  }
  const assigned = await listAppleResources(
    apple,
    `/v1/builds/${buildId}/betaGroups?limit=200`
  );
  const assignedIds = new Set(assigned.map((group) => group.id));
  for (const group of selected) {
    if (assignedIds.has(group.id)) continue;
    await apple(`/v1/builds/${buildId}/relationships/betaGroups`, {
      method: 'POST',
      body: JSON.stringify({ data: [{ type: 'betaGroups', id: group.id }] }),
    });
  }
  const verified = await listAppleResources(
    apple,
    `/v1/builds/${buildId}/betaGroups?limit=200`
  );
  const verifiedIds = new Set(verified.map((group) => group.id));
  if (selected.some((group) => !verifiedIds.has(group.id))) {
    throw new Error(
      'TestFlight group assignment was not confirmed by App Store Connect'
    );
  }
  if (selected.some((group) => group.attributes?.isInternalGroup === false)) {
    await submitExternalBetaReview(apple, buildId, config.whatsNew);
  }
  console.log(
    `Verified TestFlight build ${buildId} in ${selected.length} beta group(s): ${selected.map((group) => group.attributes?.name ?? group.id).join(', ')}.`
  );
  return selected;
}

export async function submitExternalBetaReview(apple, buildId, whatsNew) {
  const query = new URLSearchParams({ 'filter[build]': buildId, limit: '2' });
  const path = `/v1/betaAppReviewSubmissions?${query}`;
  const existing = await apple(path);
  if ((existing.data?.length ?? 0) > 1) {
    throw new Error(
      'Multiple TestFlight beta review submissions found for the build'
    );
  }
  if (!existing.data?.length) {
    const localizations = await listAppleResources(
      apple,
      `/v1/builds/${buildId}/betaBuildLocalizations?limit=200`
    );
    if (!localizations.some((item) => item.attributes?.locale === 'en-US')) {
      await apple('/v1/betaBuildLocalizations', {
        method: 'POST',
        body: JSON.stringify({
          data: {
            type: 'betaBuildLocalizations',
            attributes: { locale: 'en-US', whatsNew },
            relationships: { build: { data: { type: 'builds', id: buildId } } },
          },
        }),
      });
    }
    const detail = await apple(`/v1/builds/${buildId}/buildBetaDetail`);
    if (!detail.data?.id) throw new Error('TestFlight beta detail is missing');
    await apple(`/v1/buildBetaDetails/${detail.data.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        data: {
          type: 'buildBetaDetails',
          id: detail.data.id,
          attributes: { autoNotifyEnabled: true },
        },
      }),
    });
    await apple('/v1/betaAppReviewSubmissions', {
      method: 'POST',
      body: JSON.stringify({
        data: {
          type: 'betaAppReviewSubmissions',
          relationships: { build: { data: { type: 'builds', id: buildId } } },
        },
      }),
    });
  }
  const confirmed = await apple(path);
  const state = confirmed.data?.[0]?.attributes?.betaReviewState;
  if (!['WAITING_FOR_REVIEW', 'IN_REVIEW', 'APPROVED'].includes(state)) {
    throw new Error(
      `External TestFlight beta review is not active: ${state ?? 'MISSING'}`
    );
  }
  console.log(`External TestFlight beta review: ${state}.`);
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
  const apple = (path, options = {}) => {
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
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
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
      await distributeTestFlightBuild(apple, appId, build.id, {
        enabled: process.env.TESTFLIGHT_BETA_ENABLED ?? 'true',
        groups: process.env.TESTFLIGHT_BETA_GROUPS ?? 'all',
        whatsNew:
          process.env.TESTFLIGHT_BETA_WHATS_NEW?.trim() ||
          'Please test the latest improvements and share any issues or feedback.',
      });
      console.log(
        `Verified TestFlight processing and internal testing for build ${buildNumber} (${build.id}).`
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
