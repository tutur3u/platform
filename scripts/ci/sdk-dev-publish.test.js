const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { checksumManifest } = require('./sdk-dev-pack');
const {
  verifyDevPublication,
  waitForDevPublication,
} = require('./sdk-dev-publish');
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dev-publish-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const sourceSha = 'abcdef0'.padEnd(40, '1'),
    version = '0.28.0-dev.123.abcdef0';
  const archive = path.join(directory, `tuturuuu-${version}.tgz`);
  fs.writeFileSync(archive, 'qualified fixture bytes');
  const manifest = checksumManifest({
    archive,
    version,
    sourceSha,
    internalOnly: false,
  });
  const save = () =>
    fs.writeFileSync(
      path.join(directory, 'manifest.json'),
      JSON.stringify(manifest)
    );
  save();
  const published = {
    name: 'tuturuuu',
    version,
    dist: { integrity: manifest.integrity, shasum: manifest.shasum },
    tuturuuuBuild: { channel: 'dev', sourceSha },
  };
  return { directory, sourceSha, version, archive, manifest, published, save };
}
test('only authoritative absent version permits publish; existing identical version skips', async (t) => {
  const f = fixture(t);
  assert.deepEqual(
    await verifyDevPublication({
      ...f,
      fetchRegistry: async (url) => {
        assert.equal(url, `https://registry.npmjs.org/tuturuuu/${f.version}`);
        return { status: 404, ok: false };
      },
    }),
    { shouldPublish: true }
  );
  assert.deepEqual(
    await verifyDevPublication({
      ...f,
      fetchRegistry: async () => ({
        status: 200,
        ok: true,
        json: async () => f.published,
      }),
    }),
    { shouldPublish: false }
  );
});
test('registry timeout, auth errors and differing existing bytes never permit replay', async (t) => {
  const f = fixture(t);
  await assert.rejects(
    verifyDevPublication({
      ...f,
      fetchRegistry: async () => {
        throw new Error('timeout');
      },
    }),
    /timeout/
  );
  for (const status of [401, 403, 429, 500])
    await assert.rejects(
      verifyDevPublication({
        ...f,
        fetchRegistry: async () => ({ status, ok: false }),
      }),
      /REGISTRY_VERIFICATION_FAILED/
    );
  for (const published of [
    { ...f.published, dist: {} },
    { ...f.published, tuturuuuBuild: {} },
  ])
    await assert.rejects(
      verifyDevPublication({
        ...f,
        fetchRegistry: async () => ({
          status: 200,
          ok: true,
          json: async () => published,
        }),
      }),
      /PUBLISHED_DEV_BYTES_MISMATCH/
    );
});
test('stable versions, mismatched SHA, private manifests and archive tampering fail before registry', async (t) => {
  const f = fixture(t);
  const noFetch = async () => {
    throw new Error('MUST_NOT_FETCH');
  };
  for (const options of [{ version: '0.28.0' }, { sourceSha: 'f'.repeat(40) }])
    await assert.rejects(
      verifyDevPublication({ ...f, ...options, fetchRegistry: noFetch }),
      /INVALID_DEV_VERSION/
    );
  f.manifest.internalOnly = true;
  f.save();
  await assert.rejects(
    verifyDevPublication({ ...f, fetchRegistry: noFetch }),
    /DEV_MANIFEST_MISMATCH/
  );
  f.manifest.internalOnly = false;
  f.save();
  fs.writeFileSync(f.archive, 'tampered bytes');
  await assert.rejects(
    verifyDevPublication({ ...f, fetchRegistry: noFetch }),
    /DEV_MANIFEST_CHECKSUM_MISMATCH/
  );
});
test('trusted preflight and post-publication verifier match tested implementation bytes', () => {
  const workflow = fs.readFileSync(
    path.join(__dirname, '../../.github/workflows/release-sdk-dev.yaml'),
    'utf8'
  );
  const normalized = workflow
    .split('\n')
    .map((line) => (line.startsWith('          ') ? line.slice(10) : line))
    .join('\n');
  assert.equal(normalized.split(verifyDevPublication.toString()).length - 1, 2);
  assert.ok(normalized.includes(waitForDevPublication.toString()));
  const preflight = workflow.indexOf('- name: Verify dev identity');
  const publish = workflow.indexOf('- name: Publish dev only');
  assert.ok(preflight < publish);
  assert.ok(
    workflow.includes("if: steps.publication.outputs.should_publish == 'true'")
  );
});

test('post-publish verification retries transient 5xx and 404 without republishing', async (t) => {
  const { waitForDevPublication } = require('./sdk-dev-publish');
  const f = fixture(t),
    statuses = [503, 502, 404, 200],
    sleeps = [];
  await waitForDevPublication(
    {
      ...f,
      fetchRegistry: async () => {
        const status = statuses.shift();
        return { status, ok: status === 200, json: async () => f.published };
      },
    },
    { sleep: async (ms) => sleeps.push(ms) }
  );
  assert.deepEqual(statuses, []);
  assert.deepEqual(sleeps, [10000, 10000, 10000]);
});
test('post-publish retries are bounded and reject auth errors or byte mismatches immediately', async (t) => {
  const { waitForDevPublication } = require('./sdk-dev-publish');
  const f = fixture(t);
  let requests = 0,
    sleeps = 0;
  await assert.rejects(
    waitForDevPublication(
      {
        ...f,
        fetchRegistry: async () => {
          requests++;
          return { status: 503, ok: false };
        },
      },
      { attempts: 3, sleep: async () => sleeps++ }
    ),
    /DO_NOT_BLINDLY_REPUBLISH/
  );
  assert.equal(requests, 3);
  assert.equal(sleeps, 2);
  for (const response of [
    { status: 403, ok: false },
    { status: 200, ok: true, json: async () => ({ ...f.published, dist: {} }) },
  ]) {
    await assert.rejects(
      waitForDevPublication(
        { ...f, fetchRegistry: async () => response },
        {
          sleep: async () => {
            throw new Error('MUST_NOT_RETRY');
          },
        }
      ),
      /REGISTRY_VERIFICATION_FAILED|PUBLISHED_DEV_BYTES_MISMATCH/
    );
  }
});
