#!/usr/bin/env node
// Checks App Store Connect before an iOS or Mac upload of ledger build B:
// - B already uploaded with the same version: skip the upload (present=true)
//   so a rerun resumes at verification instead of a duplicate upload;
// - the version's train is closed by an App Store release, the version is
//   below a train TestFlight already holds, or the train has a newer build:
//   refuse, because Apple would reject the upload or testers would go back.
//   node apple-guard.mjs <IOS|MAC_OS> <version> <build>
import { appendFileSync, readFile } from 'node:fs';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { appleGet } from '../mobile-deployment/build-name.mjs';
import { compareVersions, parseVersion } from './ledger.mjs';

const BUNDLE_ID = 'com.tuturuuu.app.mobile';
const APPLE_ORIGIN = 'https://api.appstoreconnect.apple.com';
// App Store states after which Apple accepts no new builds for that version.
const CLOSED_STATES = new Set([
  'ACCEPTED',
  'PENDING_APPLE_RELEASE',
  'PENDING_DEVELOPER_RELEASE',
  'PROCESSING_FOR_APP_STORE',
  'READY_FOR_DISTRIBUTION',
  'READY_FOR_SALE',
  'REPLACED_WITH_NEW_VERSION',
]);

export function decideAppleUpload({
  version,
  build,
  trains,
  exact,
  trainBuilds,
  storeStates,
}) {
  if (!parseVersion(version) || !Number.isSafeInteger(build))
    throw new Error('A ledger version and build are required');
  if (exact.length > 1) throw new Error(`Build ${build} is ambiguous`);
  if (exact.length === 1) {
    if (exact[0].version !== version)
      throw new Error(
        `Build ${build} already exists for version ${exact[0].version}`
      );
    // Apple keeps a rejected build number; it cannot be uploaded again.
    if (['FAILED', 'INVALID'].includes(exact[0].processingState))
      throw new Error(
        `Apple rejected build ${build} (${exact[0].processingState}); fix the cause and ship a new production commit`
      );
    return { present: true };
  }
  if (storeStates.some((state) => CLOSED_STATES.has(state)))
    throw new Error(
      `Version ${version} is released or approved on the App Store; ship the next shared patch`
    );
  const newest = trains
    .filter((train) => parseVersion(train))
    .sort(compareVersions)
    .at(-1);
  if (newest && compareVersions(version, newest) < 0)
    throw new Error(
      `Version ${version} is behind ${newest}, which TestFlight already holds`
    );
  const higher = trainBuilds.filter((number) => number > build);
  if (higher.length)
    throw new Error(
      `Version ${version} already has newer build ${Math.max(...higher)}`
    );
  return { present: false };
}

async function pages(path, credentials) {
  const items = [];
  while (path) {
    const page = await appleGet(path, credentials);
    items.push(...(page.data ?? []));
    const next = page.links?.next;
    if (!next) break;
    const url = new URL(next);
    if (url.origin !== APPLE_ORIGIN)
      throw new Error('Unexpected App Store Connect pagination origin');
    path = url.pathname + url.search;
  }
  return items;
}

export async function readAppleState(credentials, platform, version, build) {
  const apps = await appleGet(
    `/v1/apps?${new URLSearchParams({ 'filter[bundleId]': BUNDLE_ID, limit: '2' })}`,
    credentials
  );
  if (apps.data?.length !== 1)
    throw new Error('Expected one App Store Connect app for the bundle');
  const app = apps.data[0].id;
  const trains = await pages(
    `/v1/preReleaseVersions?${new URLSearchParams({ 'filter[app]': app, 'filter[platform]': platform, limit: '200' })}`,
    credentials
  );
  const exactPage = await appleGet(
    `/v1/builds?${new URLSearchParams({ 'filter[app]': app, 'filter[version]': String(build), 'filter[preReleaseVersion.platform]': platform, include: 'preReleaseVersion', limit: '2' })}`,
    credentials
  );
  const exact = (exactPage.data ?? []).map((item) => ({
    processingState: item.attributes?.processingState,
    version: exactPage.included?.find(
      (included) =>
        included.type === 'preReleaseVersions' &&
        included.id === item.relationships?.preReleaseVersion?.data?.id
    )?.attributes?.version,
  }));
  const trainBuilds = await pages(
    `/v1/builds?${new URLSearchParams({ 'filter[app]': app, 'filter[preReleaseVersion.version]': version, 'filter[preReleaseVersion.platform]': platform, limit: '200' })}`,
    credentials
  );
  const storeVersions = await pages(
    `/v1/apps/${app}/appStoreVersions?${new URLSearchParams({ 'filter[platform]': platform, 'filter[versionString]': version, limit: '50' })}`,
    credentials
  );
  return {
    trains: trains.map((item) => item.attributes?.version),
    exact,
    trainBuilds: trainBuilds
      .map((item) => Number(item.attributes?.version))
      .filter(Number.isSafeInteger),
    storeStates: storeVersions.flatMap((item) => [
      item.attributes?.appVersionState,
      item.attributes?.appStoreState,
    ]),
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const args = process.argv.slice(2);
    const wait = args[0] === '--wait';
    const [platform, version, buildText] = wait ? args.slice(1) : args;
    if (!['IOS', 'MAC_OS'].includes(platform))
      throw new Error('Platform must be IOS or MAC_OS');
    const build = Number(buildText);
    const privateKey = await promisify(readFile)(
      process.env.APP_STORE_CONNECT_PRIVATE_KEY_PATH,
      'utf8'
    );
    const credentials = {
      privateKey,
      keyId: process.env.APP_STORE_CONNECT_API_KEY_ID,
      issuerId: process.env.APP_STORE_CONNECT_ISSUER_ID,
    };
    if (wait) {
      // Confirms Apple accepted an upload (the Mac job has no other check).
      const deadline = Date.now() + 30 * 60_000;
      for (;;) {
        const { exact } = await readAppleState(
          credentials,
          platform,
          version,
          build
        );
        const state = exact[0]?.processingState ?? 'NOT_VISIBLE';
        if (exact.length === 1 && exact[0].version !== version)
          throw new Error(`Build ${build} belongs to ${exact[0].version}`);
        if (['FAILED', 'INVALID'].includes(state))
          throw new Error(`Apple rejected build ${build}: ${state}`);
        if (state === 'VALID') break;
        if (Date.now() > deadline)
          throw new Error(`Build ${build} is not processed after 30 minutes`);
        console.log(`Waiting for ${platform} build ${build}: ${state}`);
        await new Promise((resolve) => setTimeout(resolve, 30_000));
      }
      console.log(`App Store Connect accepted ${platform} build ${build}.`);
    }
    const { present } = wait
      ? { present: true }
      : decideAppleUpload({
          version,
          build,
          ...(await readAppleState(credentials, platform, version, build)),
        });
    console.log(
      `App Store Connect ${platform} build ${build} (${version}) already uploaded: ${present}`
    );
    if (process.env.GITHUB_OUTPUT)
      appendFileSync(process.env.GITHUB_OUTPUT, `present=${present}\n`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
