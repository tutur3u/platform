import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import test from 'node:test';
import {
  UPLOADED_TREE_ARTIFACT,
  UPLOADED_TREE_FILE,
  decideStorePublish,
  gateOutput,
  loadRecordedTree,
  parseUploadedTree,
  readZipText,
} from './store-publish-gate.mjs';

const same = 'a'.repeat(40);
const changed = 'b'.repeat(40);

function storedZip(name, text, method = 0) {
  const raw = Buffer.from(text);
  const data = method === 8 ? deflateRawSync(raw) : raw;
  const nameBuf = Buffer.from(name);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(method, 8);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(method === 8 ? raw.length : data.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  return Buffer.concat([local, nameBuf, data]);
}

test('an unchanged mobile tree does not upload', () => {
  assert.deepEqual(
    decideStorePublish({
      currentTree: same,
      recordedTree: same,
      force: false,
    }),
    { publish: false, reason: 'unchanged' }
  );
});

test('a changed mobile tree uploads', () => {
  assert.deepEqual(
    decideStorePublish({
      currentTree: changed,
      recordedTree: same,
      force: false,
    }),
    { publish: true, reason: 'tree-changed' }
  );
});

test('force publishes an unchanged tree and a missing record still publishes', () => {
  assert.equal(
    decideStorePublish({
      currentTree: same,
      recordedTree: same,
      force: true,
    }).reason,
    'force'
  );
  assert.equal(
    decideStorePublish({
      currentTree: same,
      recordedTree: null,
      force: false,
    }).reason,
    'no-recorded-upload'
  );
});

test('a malformed recorded tree fails closed', () => {
  assert.throws(
    () =>
      decideStorePublish({
        currentTree: same,
        recordedTree: 'not-a-tree',
        force: false,
      }),
    /malformed/
  );
});

test('the uploaded artifact and its zip entry carry the tree hash', () => {
  const text = `tree ${same}\n`;
  assert.equal(parseUploadedTree(text), same);
  assert.equal(
    readZipText(storedZip(UPLOADED_TREE_FILE, text), UPLOADED_TREE_FILE),
    text
  );
  assert.equal(
    readZipText(storedZip(UPLOADED_TREE_FILE, text, 8), UPLOADED_TREE_FILE),
    text
  );
  assert.equal(gateOutput({ publish: false, tree: same }), `publish=false\ntree=${same}\n`);
});

test('the last uploaded artifact wins over an older successful job', async () => {
  const requests = [];
  const request = async (path) => {
    requests.push(path);
    if (path.endsWith('/runs?per_page=30')) {
      return {
        workflow_runs: [{ id: 9, head_sha: '1'.repeat(40), created_at: '2026-11-09T00:00:00Z' }],
      };
    }
    if (path.endsWith('/artifacts?per_page=100')) {
      return {
        artifacts: [{ id: 4, name: UPLOADED_TREE_ARTIFACT, expired: false }],
      };
    }
    if (path.endsWith('/zip')) return storedZip(UPLOADED_TREE_FILE, `tree ${same}\n`);
    throw new Error(path);
  };
  const recorded = await loadRecordedTree({
    repo: 'tutur3u/platform',
    token: 'test-token',
    readTree: () => changed,
    request,
  });
  assert.equal(recorded, same);
  assert.equal(requests.some((path) => path.endsWith('/jobs?per_page=100')), false);
});

test('without an artifact, the last successful upload tree is the baseline', async () => {
  const request = async (path) => {
    if (path.endsWith('/runs?per_page=30')) {
      return {
        workflow_runs: [
          { id: 2, head_sha: '2'.repeat(40) },
          { id: 1, head_sha: '1'.repeat(40) },
        ],
      };
    }
    if (path.endsWith('/artifacts?per_page=100')) return { artifacts: [] };
    if (path.endsWith('/runs/2/jobs?per_page=100')) {
      return { jobs: [{ name: 'Upload iOS to TestFlight', conclusion: 'failure' }] };
    }
    if (path.endsWith('/runs/1/jobs?per_page=100')) {
      return {
        jobs: [{ name: 'Upload iOS to TestFlight', conclusion: 'success' }],
      };
    }
    throw new Error(path);
  };
  const recorded = await loadRecordedTree({
    repo: 'tutur3u/platform',
    token: 'test-token',
    readTree: (sha) => (sha === '1'.repeat(40) ? same : changed),
    request,
  });
  assert.equal(recorded, same);
  assert.equal(
    decideStorePublish({
      currentTree: same,
      recordedTree: recorded,
      force: false,
    }).publish,
    false
  );
  assert.equal(
    decideStorePublish({
      currentTree: changed,
      recordedTree: recorded,
      force: false,
    }).publish,
    true
  );
});
