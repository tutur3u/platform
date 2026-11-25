import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUDGET_MIB, measureUpload } from './web-opennext-size.mjs';
import { assertBundleOmitsRedis } from './web-opennext-smoke.mjs';

// Build-output gate for an apps/web vinext Worker: the resolved
// react-server-dom-webpack must be patched for GHSA-xqc2-xf4c-x3h3, no emitted
// module may be, import or embed the real Redis client, and the upload must
// fit the family budget. Input is the Worker bundle of the Cloudflare Build
// Output (`.cloudflare/output/v1/workers/default/bundle`), the app directory
// the build resolved packages from, and optionally the
// `cf deploy --dry-run --prebuilt` log for the provider's own gzip figure.
export const VINEXT_ENTRY = 'index.mjs';

const STABLE_VERSION = /^(\d+)\.(\d+)\.(\d+)$/u;

/**
 * GHSA-xqc2-xf4c-x3h3 affects react-server-dom-webpack >=19.2.0 <19.2.9 and
 * 19.3.0; 19.2.9 and 19.3.1 are patched. Prereleases are refused outright.
 */
export function isPatchedRsdwVersion(version) {
  const match = STABLE_VERSION.exec(version);
  if (!match) return false;
  const [major, minor, patch] = match.slice(1).map(Number);
  if (major !== 19) return major > 19;
  if (minor < 2) return false;
  if (minor === 2) return patch >= 9;
  if (minor === 3) return patch >= 1;
  return true;
}

/** The react-server-dom-webpack version `appDir` resolves, if patched. */
export function assertPatchedRsdw(appDir) {
  const require = createRequire(join(resolve(appDir), 'package.json'));
  const { version } = JSON.parse(
    readFileSync(
      require.resolve('react-server-dom-webpack/package.json'),
      'utf8'
    )
  );
  if (!isPatchedRsdwVersion(version)) {
    throw new Error(
      `react-server-dom-webpack ${version} is vulnerable (GHSA-xqc2-xf4c-x3h3); use 19.2.9 or 19.3.1 or later.`
    );
  }
  return version;
}

const BUILD_COMMIT = /^[0-9a-f]{40}$/u;
const STAMP_HEADER = 'x-tuturuuu-build';

/**
 * The client assets of a family build must carry `_headers` with the
 * `x-tuturuuu-build` rule for `commit`
 * (apps/web/cloudflare/vinext/build-stamp-plugin.ts), so assets served
 * without the Worker are stamped. An uploader must pass this file's contents
 * as the assets config `_headers`, never as a public file.
 */
export function assertAssetHeadersStamp(assetsDir, commit) {
  if (!BUILD_COMMIT.test(commit ?? '')) {
    throw new Error(`build commit must be 40 lowercase hex, got ${commit}`);
  }
  const file = join(resolve(assetsDir), '_headers');
  if (!existsSync(file)) throw new Error(`${file} is missing`);
  const expected = `${STAMP_HEADER}: ${commit}`;
  let inRoot = false;
  let stamped = false;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/u)) {
    if (/^\S/u.test(line)) inRoot = line.trim() === '/*';
    else if (inRoot && line.trim().toLowerCase() === expected) stamped = true;
  }
  if (!stamped) {
    throw new Error(`${file} has no "/*" rule setting ${expected}`);
  }
  return file;
}

/** Client asset directories a build may emit, nearest first. */
export function assetsDirCandidates(bundleDir, appDir) {
  const candidates = [join(dirname(resolve(bundleDir)), 'assets')];
  if (appDir) candidates.push(join(resolve(appDir), 'dist/client'));
  return candidates;
}

/** The stamped `_headers` of the build's client assets (see above). */
export function findAssetHeadersStamp(
  bundleDir,
  { appDir, assetsDir, commit }
) {
  const candidates = assetsDir
    ? [resolve(assetsDir)]
    : assetsDirCandidates(bundleDir, appDir);
  const dir = candidates.find((candidate) =>
    existsSync(join(candidate, '_headers'))
  );
  if (!dir) {
    throw new Error(
      `No client _headers for build commit ${commit} in ${candidates.join(', ')}`
    );
  }
  return assertAssetHeadersStamp(dir, commit);
}

export function checkVinextBundle(
  bundleDir,
  { appDir, log = null, commit = null, assetsDir = null } = {}
) {
  const reactServerDomWebpack = appDir ? assertPatchedRsdw(appDir) : null;
  assertBundleOmitsRedis(bundleDir, VINEXT_ENTRY);
  const assetHeaders = commit
    ? findAssetHeadersStamp(bundleDir, { appDir, assetsDir, commit })
    : null;
  const { files, ...summary } = measureUpload(bundleDir, log);
  return {
    ...summary,
    fileCount: files.length,
    redisFree: true,
    reactServerDomWebpack,
    assetHeaders,
  };
}

const USAGE =
  'usage: web-vinext-bundle-check.mjs <bundle-dir> --app <app-dir> [--log <cf-dry-run.log>] [--assets <client-dir>]\n' +
  '       web-vinext-bundle-check.mjs --rsdw <app-dir>\n' +
  '       web-vinext-bundle-check.mjs --stamp <client-dir> <commit>\n' +
  'With PLATFORM_BUILD_COMMIT set, the bundle check also requires the stamped client _headers.';

function main(argv) {
  if (argv[0] === '--rsdw') {
    if (!argv[1] || argv.length !== 2) throw new Error(USAGE);
    console.log(`react-server-dom-webpack ${assertPatchedRsdw(argv[1])}`);
    return 0;
  }
  if (argv[0] === '--stamp') {
    if (!argv[1] || !argv[2] || argv.length !== 3) throw new Error(USAGE);
    console.log(`stamped ${assertAssetHeadersStamp(argv[1], argv[2])}`);
    return 0;
  }
  const [bundleDir, ...rest] = argv;
  let appDir = null;
  let logPath = null;
  let assetsDir = null;
  for (let index = 0; index < rest.length; index += 1) {
    if (rest[index] === '--app') appDir = rest[(index += 1)];
    else if (rest[index] === '--log') logPath = rest[(index += 1)];
    else if (rest[index] === '--assets') assetsDir = rest[(index += 1)];
    else throw new Error(USAGE);
  }
  if (!bundleDir || !appDir) throw new Error(USAGE);
  const result = checkVinextBundle(bundleDir, {
    appDir,
    log: logPath ? readFileSync(logPath, 'utf8') : null,
    commit: process.env.PLATFORM_BUILD_COMMIT?.trim() || null,
    assetsDir,
  });
  console.log(JSON.stringify(result, null, 2));
  if (result.gatedMiB > BUDGET_MIB) {
    console.error(
      `Upload is ${result.gatedMiB} MiB gzip, over the ${BUDGET_MIB} MiB family budget.`
    );
    return 1;
  }
  return 0;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
