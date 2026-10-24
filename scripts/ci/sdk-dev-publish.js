const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

async function verifyDevPublication({
  directory,
  sourceSha,
  version,
  fetchRegistry = fetch,
}) {
  if (
    !/^[a-f0-9]{40}$/.test(sourceSha || '') ||
    !/^\d+\.\d+\.\d+-dev\.[1-9][0-9]*\.[a-f0-9]{7}$/.test(version || '') ||
    !version.endsWith(`.${sourceSha.slice(0, 7)}`)
  )
    throw new Error('INVALID_DEV_VERSION');
  const manifest = JSON.parse(
    fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8')
  );
  if (
    manifest.schemaVersion !== 1 ||
    manifest.name !== 'tuturuuu' ||
    manifest.version !== version ||
    manifest.sha !== sourceSha ||
    manifest.sourceSha !== sourceSha ||
    manifest.channel !== 'dev' ||
    manifest.internalOnly !== false ||
    manifest.archive !== `tuturuuu-${version}.tgz`
  )
    throw new Error('DEV_MANIFEST_MISMATCH');
  const archive = fs.readFileSync(path.join(directory, manifest.archive));
  const digest = (algorithm, encoding) =>
    createHash(algorithm).update(archive).digest(encoding);
  const integrity = `sha512-${digest('sha512', 'base64')}`;
  const shasum = digest('sha1', 'hex');
  if (
    manifest.integrity !== integrity ||
    manifest.shasum !== shasum ||
    manifest.sha256 !== digest('sha256', 'hex')
  )
    throw new Error('DEV_MANIFEST_CHECKSUM_MISMATCH');
  const response = await fetchRegistry(
    `https://registry.npmjs.org/tuturuuu/${version}`,
    { signal: AbortSignal.timeout(10000) }
  );
  if (response.status === 404) return { shouldPublish: true };
  if (!response.ok)
    throw Object.assign(
      new Error(`REGISTRY_VERIFICATION_FAILED: ${response.status}`),
      { retryable: response.status >= 500 && response.status < 600 }
    );
  const published = await response.json();
  if (
    published.name !== 'tuturuuu' ||
    published.version !== version ||
    published.dist?.integrity !== integrity ||
    published.dist?.shasum !== shasum ||
    published.tuturuuuBuild?.channel !== 'dev' ||
    published.tuturuuuBuild?.sourceSha !== sourceSha
  )
    throw new Error('PUBLISHED_DEV_BYTES_MISMATCH');
  return { shouldPublish: false };
}
async function waitForDevPublication(
  options,
  {
    attempts = 12,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  } = {}
) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      if (!(await verifyDevPublication(options)).shouldPublish) return;
    } catch (error) {
      if (error.retryable !== true) throw error;
    }
    if (attempt + 1 < attempts) await sleep(10000);
  }
  throw new Error('PUBLICATION_NOT_VISIBLE_DO_NOT_BLINDLY_REPUBLISH');
}
module.exports = { verifyDevPublication, waitForDevPublication };
