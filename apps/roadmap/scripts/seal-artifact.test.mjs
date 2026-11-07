import { roadmapBoundary } from '../src/request-boundary.ts';
import { assertEmittedMapping } from './asset-mapping.mjs';
import { packageAssets } from './package-assets.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  openArtifactEntry,
  readRegularFile,
  sealArtifact,
} from './seal-artifact.mjs';

const source = 'a'.repeat(40);
function fixture(t) {
  const root = fs.mkdtempSync(join(tmpdir(), 'roadmap-seal-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
function read(path, remaining) {
  const fd = openArtifactEntry(path);
  try {
    return readRegularFile(fd, remaining);
  } finally {
    fs.closeSync(fd);
  }
}
function artifact(t) {
  const root = fixture(t);
  fs.mkdirSync(join(root, 'dist/server'), { recursive: true });
  fs.mkdirSync(join(root, 'dist/client/roadmap'), { recursive: true });
  fs.writeFileSync(
    join(root, 'dist/client/roadmap/app.js'),
    `export const source = '${source}';`
  );
  fs.writeFileSync(join(root, 'dist/server/worker.js'), 'export default {};');
  fs.writeFileSync(
    join(root, 'dist/server/wrangler.json'),
    JSON.stringify({
      name: 'tuturuuu-roadmap',
      main: 'worker.js',
      assets: {
        directory: '../client',
        binding: 'ASSETS',
        run_worker_first: true,
        not_found_handling: 'none',
      },
    })
  );
  return root;
}

test('file bytes, size and digest come from one regular-file descriptor', (t) => {
  const file = join(fixture(t), 'data');
  fs.writeFileSync(file, 'original');
  const result = read(file, 8);
  assert.equal(result.data.toString(), 'original');
  assert.equal(result.bytes, 8);
  assert.equal(
    result.sha256,
    createHash('sha256').update('original').digest('hex')
  );
  assert.throws(() => read(file, 7), /size bound/);
});

test('no-follow access rejects symlinks and non-regular descriptors', (t) => {
  const root = fixture(t),
    target = join(root, 'outside'),
    link = join(root, 'link');
  fs.writeFileSync(target, 'sentinel');
  fs.symlinkSync(target, link);
  assert.throws(() => read(link), /ELOOP|EMLINK/);
  assert.throws(() => read(root), /regular artifact/);
  assert.equal(fs.readFileSync(target, 'utf8'), 'sentinel');
});

test('hard-linked files cannot import an outside artifact object', (t) => {
  const root = fixture(t),
    file = join(root, 'file');
  fs.writeFileSync(file, 'sentinel');
  fs.linkSync(file, join(root, 'second'));
  assert.throws(() => read(file), /single-link/);
});

test('replacing a pathname cannot redirect an already-open descriptor', (t) => {
  const root = fixture(t),
    file = join(root, 'file');
  fs.writeFileSync(file, 'original');
  const fd = openArtifactEntry(file);
  try {
    fs.renameSync(file, join(root, 'held'));
    fs.writeFileSync(file, 'replacement');
    assert.equal(readRegularFile(fd).data.toString(), 'original');
  } finally {
    fs.closeSync(fd);
  }
});

test('growth during a descriptor read refuses the seal', (t) => {
  const file = join(fixture(t), 'file');
  fs.writeFileSync(file, 'original');
  const original = fs.readSync;
  let changed = false;
  t.mock.method(fs, 'readSync', (...args) => {
    const count = original(...args);
    if (!changed) {
      changed = true;
      fs.appendFileSync(file, 'extra');
    }
    return count;
  });
  assert.throws(() => read(file), /grew|changed/);
});

const linux = { skip: process.platform !== 'linux' };
test(
  'qualified Linux sealing retains config/source assertions and refuses reuse',
  linux,
  (t) => {
    const root = artifact(t);
    const manifest = sealArtifact(root, source);
    assert.equal(manifest.worker, 'tuturuuu-roadmap');
    assert.equal(manifest.basePath, '/roadmap');
    assert.equal(manifest.files.length, 3);
    assert.deepEqual(
      JSON.parse(fs.readFileSync(join(root, 'roadmap-artifact.json'), 'utf8')),
      manifest
    );
    assert.throws(() => sealArtifact(root, source), /EEXIST/);
    const bad = artifact(t);
    fs.writeFileSync(
      join(bad, 'dist/client/roadmap/app.js'),
      'export const missing = true;'
    );
    assert.throws(() => sealArtifact(bad, source), /Source identity missing/);
    fs.writeFileSync(join(bad, 'dist/client/roadmap/app.js'), source);
    fs.writeFileSync(
      join(bad, 'dist/server/wrangler.json'),
      JSON.stringify({
        name: 'tuturuuu-roadmap',
        main: 'worker.js',
        assets: { base_path: '/roadmap' },
      })
    );
    assert.throws(
      () => sealArtifact(bad, source),
      /base must be absent or root/
    );
  }
);

test(
  'ancestor replacement is refused without following an outside sentinel',
  linux,
  (t) => {
    const root = artifact(t),
      outside = fixture(t);
    fs.writeFileSync(join(outside, 'sentinel'), 'outside-unchanged');
    const original = fs.readdirSync;
    let changed = false;
    t.mock.method(fs, 'readdirSync', (path, ...args) => {
      const names = original(path, ...args);
      if (!changed && String(path).startsWith('/proc/self/fd/')) {
        changed = true;
        fs.renameSync(join(root, 'dist'), join(root, 'held-dist'));
        fs.symlinkSync(outside, join(root, 'dist'));
      }
      return names;
    });
    assert.throws(() => sealArtifact(root, source), /ELOOP|changed/);
    assert.equal(
      fs.readFileSync(join(outside, 'sentinel'), 'utf8'),
      'outside-unchanged'
    );
    assert.equal(fs.existsSync(join(root, 'roadmap-artifact.json')), false);
  }
);

test(
  'entry replacement with identical bytes still fails inode identity',
  linux,
  (t) => {
    const root = artifact(t),
      file = join(root, 'dist/client/roadmap/app.js');
    const original = fs.fstatSync;
    let changed = false;
    t.mock.method(fs, 'fstatSync', (fd, ...args) => {
      const stat = original(fd, ...args);
      if (!changed && stat.isFile()) {
        changed = true;
        const bytes = fs.readFileSync(file);
        fs.renameSync(file, join(root, 'held-app.js'));
        fs.writeFileSync(file, bytes);
      }
      return stat;
    });
    assert.throws(() => sealArtifact(root, source), /changed/);
    assert.equal(fs.existsSync(join(root, 'roadmap-artifact.json')), false);
  }
);

test(
  'unsupported hosts fail closed before filesystem enumeration',
  { skip: process.platform === 'linux' },
  () => {
    assert.throws(
      () => sealArtifact('/unavailable', source),
      /requires the qualified Linux/
    );
  }
);

function mappingConfig() {
  return {
    name: 'tuturuuu-roadmap',
    main: 'worker.js',
    assets: {
      directory: '../client',
      binding: 'ASSETS',
      run_worker_first: true,
      not_found_handling: 'none',
    },
  };
}
const mappedPaths = [
  'dist/server/worker.js',
  'dist/client/roadmap/assets/app.js',
];
const checkMapping = (config, paths = mappedPaths) =>
  assertEmittedMapping(config, 'dist/server/wrangler.json', paths, '/build');

test('root and bare mount canonicalize with query; mounted URLs pass through', () => {
  for (const path of ['/', '/?x=1', '/roadmap', '/roadmap?x=1&x=2']) {
    const request = new Request(`https://example.test${path}`);
    const response = roadmapBoundary(request);
    assert.equal(response.status, 308);
    assert.equal(
      response.headers.get('Location'),
      `/roadmap/${new URL(request.url).search}`
    );
  }
  for (const path of [
    '/roadmap/',
    '/roadmap/?x=1',
    '/roadmap/assets/app.js',
    '/roadmap/_serverFn/abc?x=1',
  ]) {
    assert.equal(
      roadmapBoundary(new Request(`https://example.test${path}`)),
      undefined
    );
  }
  for (const path of ['/other', '/roadmap-other', '/assets/app.js']) {
    assert.equal(
      roadmapBoundary(new Request(`https://example.test${path}`)).status,
      404
    );
  }
});

test('encoded path aliases cannot reach the asset fallback', () => {
  for (const path of [
    '/roadmap/%2fother',
    '/roadmap/%ZZ',
    '/%72oadmap/assets/app.js',
  ]) {
    assert.equal(
      roadmapBoundary(new Request(`https://example.test${path}`)).status,
      400
    );
  }
});

test('root provider base maps every physical client key to the public mount', () => {
  checkMapping(mappingConfig());
  const root = mappingConfig();
  root.assets.base_path = '/';
  checkMapping(root);
  root.assets.html_handling = 'auto-trailing-slash';
  checkMapping(root);
  for (const delta of [
    { base_path: '/roadmap' },
    { base_path: null },
    { directory: '../other' },
    { directory: '/outside' },
    { binding: 'OTHER' },
    { run_worker_first: false },
    { not_found_handling: 'single-page-application' },
    { html_handling: 'none' },
  ]) {
    const config = mappingConfig();
    Object.assign(config.assets, delta);
    assert.throws(() => checkMapping(config));
  }
  for (const key of [
    'app.js',
    'roadmap-other/app.js',
    'roadmap/../app.js',
    'roadmap/%2fapp.js',
    'roadmap//app.js',
    'roadmap/app.js?x=1',
  ]) {
    assert.throws(() =>
      checkMapping(mappingConfig(), [
        'dist/server/worker.js',
        `dist/client/${key}`,
      ])
    );
  }
  for (const config of [
    null,
    {},
    { ...mappingConfig(), main: '../outside.js' },
    { ...mappingConfig(), assets: [] },
  ]) {
    assert.throws(() => checkMapping(config));
  }
  assert.throws(
    () => checkMapping(mappingConfig(), ['dist/server/worker.js']),
    /missing/
  );
  assert.throws(() => sealArtifact('/unused', ''), /exact build source/);
});

test('packaging moves real bytes once and refuses unsafe or missing clients', (t) => {
  const root = fixture(t);
  fs.mkdirSync(join(root, 'dist/client/assets'), { recursive: true });
  fs.writeFileSync(join(root, 'dist/client/assets/app.js'), 'client bytes');
  fs.writeFileSync(join(root, 'dist/client/styles.css'), 'styles');
  assert.deepEqual(packageAssets(root).sort(), [
    'roadmap/assets/app.js',
    'roadmap/styles.css',
  ]);
  assert.equal(
    fs.readFileSync(join(root, 'dist/client/roadmap/assets/app.js'), 'utf8'),
    'client bytes'
  );
  assert.deepEqual(fs.readdirSync(join(root, 'dist/client')), ['roadmap']);
  assert.throws(() => packageAssets(root), /already exists/);
  const bad = fixture(t);
  fs.mkdirSync(join(bad, 'dist/client'), { recursive: true });
  assert.throws(() => packageAssets(bad), /missing/);
  fs.symlinkSync(
    join(root, 'dist/client/roadmap/assets/app.js'),
    join(bad, 'dist/client/app.js')
  );
  assert.throws(() => packageAssets(bad), /single-link/);
});
