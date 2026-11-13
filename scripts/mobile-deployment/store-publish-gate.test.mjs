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

// Complete single-disk ZIPs, including streamed entries with signed or unsigned descriptors.
function archive(entries) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const {
    name,
    text,
    method = 8,
    descriptor = false,
    signed = true,
  } of entries) {
    const raw = Buffer.from(text);
    const data = method === 8 ? deflateRawSync(raw) : raw;
    let crc = 0xffffffff;
    for (const byte of raw) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++)
        crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    const nameBuf = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(descriptor ? 8 : 0, 6);
    local.writeUInt16LE(method, 8);
    if (!descriptor) {
      local.writeUInt32LE(crc, 14);
      local.writeUInt32LE(data.length, 18);
      local.writeUInt32LE(raw.length, 22);
    }
    local.writeUInt16LE(nameBuf.length, 26);
    const tail = Buffer.alloc(descriptor ? (signed ? 16 : 12) : 0);
    if (descriptor) {
      const start = signed ? 4 : 0;
      if (signed) tail.writeUInt32LE(0x08074b50);
      tail.writeUInt32LE(crc, start);
      tail.writeUInt32LE(data.length, start + 4);
      tail.writeUInt32LE(raw.length, start + 8);
    }
    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50);
    record.writeUInt16LE(20, 4);
    record.writeUInt16LE(20, 6);
    local.copy(record, 8, 6, 10);
    record.writeUInt32LE(crc, 16);
    record.writeUInt32LE(data.length, 20);
    record.writeUInt32LE(raw.length, 24);
    record.writeUInt16LE(nameBuf.length, 28);
    record.writeUInt32LE(offset, 42);
    central.push(record, nameBuf);
    locals.push(local, nameBuf, data, tail);
    offset += local.length + nameBuf.length + data.length + tail.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

async function recordedFrom(zip) {
  return loadRecordedTree({
    repo: 'tutur3u/platform',
    token: 'test-token',
    readTree: () => {
      throw new Error('must not fall back');
    },
    request: async (path) => {
      if (path.endsWith('/runs?per_page=30'))
        return { workflow_runs: [{ id: 1 }] };
      if (path.endsWith('/artifacts?per_page=100'))
        return { artifacts: [{ id: 2, name: UPLOADED_TREE_ARTIFACT }] };
      if (path.endsWith('/zip')) return zip;
      throw new Error(path);
    },
  });
}

for (const method of [0, 8]) {
  for (const signed of [true, false]) {
    test(`streamed ZIP method ${method}, signed descriptor ${signed}`, async () => {
      const text = `tree ${same}\n`;
      const zip = archive([
        { name: 'other.txt', text: 'skip me', descriptor: true },
        {
          name: `nested/${UPLOADED_TREE_FILE}`,
          text,
          method,
          descriptor: true,
          signed,
        },
      ]);
      assert.equal(readZipText(zip, UPLOADED_TREE_FILE), text);
      const recordedTree = await recordedFrom(zip);
      assert.equal(recordedTree, same);
      assert.deepEqual(
        decideStorePublish({ currentTree: same, recordedTree }),
        { publish: false, reason: 'unchanged' }
      );
      assert.deepEqual(
        decideStorePublish({ currentTree: changed, recordedTree }),
        { publish: true, reason: 'tree-changed' }
      );
    });
  }
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
  assert.equal(
    gateOutput({ publish: false, tree: same }),
    `publish=false\ntree=${same}\n`
  );
});

test('the last uploaded artifact wins over an older successful job', async () => {
  const requests = [];
  const request = async (path) => {
    requests.push(path);
    if (path.endsWith('/runs?per_page=30')) {
      return {
        workflow_runs: [
          {
            id: 9,
            head_sha: '1'.repeat(40),
            created_at: '2026-11-09T00:00:00Z',
          },
        ],
      };
    }
    if (path.endsWith('/artifacts?per_page=100')) {
      return {
        artifacts: [{ id: 4, name: UPLOADED_TREE_ARTIFACT, expired: false }],
      };
    }
    if (path.endsWith('/zip'))
      return storedZip(UPLOADED_TREE_FILE, `tree ${same}\n`);
    throw new Error(path);
  };
  const recorded = await loadRecordedTree({
    repo: 'tutur3u/platform',
    token: 'test-token',
    readTree: () => changed,
    request,
  });
  assert.equal(recorded, same);
  assert.equal(
    requests.some((path) => path.endsWith('/jobs?per_page=100')),
    false
  );
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
      return {
        jobs: [{ name: 'Upload iOS to TestFlight', conclusion: 'failure' }],
      };
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

for (const method of [0, 8]) {
  test(`complete and local-only ZIP method ${method} preserves nested exact matching`, () => {
    const text = `tree ${same}\n`;
    const entries = [
      { name: `${UPLOADED_TREE_FILE}.bak`, text: 'ignore' },
      { name: `folder/${UPLOADED_TREE_FILE}`, text, method },
    ];
    assert.equal(readZipText(archive(entries), UPLOADED_TREE_FILE), text);
    assert.equal(
      readZipText(
        Buffer.concat(entries.map((e) => storedZip(e.name, e.text, e.method))),
        UPLOADED_TREE_FILE
      ),
      text
    );
    assert.throws(
      () => readZipText(archive(entries.slice(0, 1)), UPLOADED_TREE_FILE),
      /missing/
    );
  });
}

test('invalid archives reject through the artifact seam without fallback publication', async () => {
  const valid = archive([
    { name: UPLOADED_TREE_FILE, text: `tree ${same}\n`, descriptor: true },
  ]);
  const end = valid.length - 22;
  const central = valid.readUInt32LE(end + 16);
  const data = 30 + Buffer.byteLength(UPLOADED_TREE_FILE);
  const descriptor = data + valid.readUInt32LE(central + 20);
  const mutations = [
    [
      'central offset out of bounds',
      (b) => b.writeUInt32LE(0xfffffffe, end + 16),
    ],
    [
      'local offset out of bounds',
      (b) => b.writeUInt32LE(0xfffffffe, central + 42),
    ],
    [
      'entry size out of bounds',
      (b) => b.writeUInt32LE(0xfffffffe, central + 20),
    ],
    ['truncated name', (b) => b.writeUInt16LE(65535, central + 28)],
    ['truncated extra', (b) => b.writeUInt16LE(65535, 28)],
    [
      'different local name',
      (b) => {
        b[30] ^= 1;
      },
    ],
    ['different method', (b) => b.writeUInt16LE(0, 8)],
    [
      'unsupported method',
      (b) => {
        b.writeUInt16LE(99, 8);
        b.writeUInt16LE(99, central + 10);
      },
    ],
    [
      'encrypted',
      (b) => {
        b.writeUInt16LE(9, 6);
        b.writeUInt16LE(9, central + 8);
      },
    ],
    ['ZIP64 size', (b) => b.writeUInt32LE(0xffffffff, central + 24)],
    ['multi-disk', (b) => b.writeUInt16LE(1, end + 4)],
    ['descriptor size mismatch', (b) => b.writeUInt32LE(0, descriptor + 8)],
    ['damaged compressed bytes', (b) => b.fill(0, data, descriptor)],
    [
      'checksum mismatch',
      (b) => {
        b.writeUInt32LE(0, central + 16);
        b.writeUInt32LE(0, descriptor + 4);
      },
    ],
    [
      'uncompressed size mismatch',
      (b) => {
        b.writeUInt32LE(1, central + 24);
        b.writeUInt32LE(1, descriptor + 12);
      },
    ],
  ];
  for (const [label, mutate] of mutations) {
    const broken = Buffer.from(valid);
    mutate(broken);
    assert.throws(
      () => readZipText(broken, UPLOADED_TREE_FILE),
      undefined,
      label
    );
    await assert.rejects(recordedFrom(broken), undefined, label);
  }
  for (const length of [
    0,
    10,
    data - 1,
    descriptor - 1,
    descriptor + 8,
    valid.length - 1,
  ]) {
    await assert.rejects(
      recordedFrom(valid.subarray(0, length)),
      undefined,
      `truncated at ${length}`
    );
  }
  const truncatedStored = storedZip(
    UPLOADED_TREE_FILE,
    `tree ${same}\n`
  ).subarray(0, -1);
  assert.throws(
    () => readZipText(truncatedStored, UPLOADED_TREE_FILE),
    /malformed/
  );
  await assert.rejects(
    recordedFrom(
      archive([
        {
          name: UPLOADED_TREE_FILE,
          text: `tree ${same} trailing`,
          descriptor: true,
        },
      ])
    ),
    /artifact is malformed/
  );
});

test('truncated directory cannot turn a complete stored archive into a successful record', async () => {
  const zip = archive([
    { name: UPLOADED_TREE_FILE, text: `tree ${same}\n`, method: 0 },
  ]);
  await assert.rejects(recordedFrom(zip.subarray(0, -1)));
});
