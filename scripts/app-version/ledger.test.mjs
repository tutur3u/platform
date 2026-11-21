import assert from 'node:assert/strict';
import test from 'node:test';
import {
  allocate,
  isStale,
  outputLines,
  parseTagObjects,
  readLedger,
} from './allocate.mjs';
import { decideAppleUpload } from './apple-guard.mjs';
import {
  BUILD_FLOOR,
  classifyChanges,
  entryMessage,
  MIGRATION_FLOOR_VERSION,
  parseEntry,
  planAllocation,
  platformLabel,
  windowsPackageVersion,
} from './ledger.mjs';

const sha = (char) => char.repeat(40);
const pubspec = (version) => `name: mobile\nversion: ${version}+102\n`;
// Linear history a < b < c < d.
const order = ['a', 'b', 'c', 'd'].map(sha);
const history = (files = []) => ({
  isAncestor: (x, y) => order.indexOf(x) <= order.indexOf(y),
  changedFiles: () => files,
});
const entry = (build, version, commit, extra = {}) => ({
  build,
  version,
  sha: commit,
  shared: true,
  platforms: [],
  ...extra,
});

test('the first entry starts above both legacy schemes', () => {
  const plan = planAllocation({
    entries: [],
    sha: sha('a'),
    pubspec: pubspec('0.27.0'),
    ...history(),
  });
  assert.equal(plan.action, 'create');
  assert.equal(plan.entry.version, MIGRATION_FLOOR_VERSION);
  assert.equal(plan.entry.build, BUILD_FLOOR);
  assert.ok(BUILD_FLOOR > 578001, 'above the last mobile versionCode');
});

test('shared app code bumps the patch for every platform', () => {
  const plan = planAllocation({
    entries: [entry(BUILD_FLOOR, '0.27.27', sha('a'))],
    sha: sha('b'),
    pubspec: pubspec('0.27.0'),
    ...history(['apps/mobile/lib/main.dart']),
  });
  assert.deepEqual(plan.entry, {
    build: BUILD_FLOOR + 1,
    version: '0.27.28',
    sha: sha('b'),
    shared: true,
    platforms: [],
  });
});

test('a platform-only fix keeps X.Y.Z and gets a new build', () => {
  const plan = planAllocation({
    entries: [entry(BUILD_FLOOR + 4, '0.28.0', sha('a'))],
    sha: sha('b'),
    pubspec: pubspec('0.28.0'),
    ...history(['apps/mobile/android/app/build.gradle.kts']),
  });
  assert.equal(plan.entry.version, '0.28.0');
  assert.equal(plan.entry.build, BUILD_FLOOR + 5);
  assert.equal(plan.entry.shared, false);
  assert.equal(
    platformLabel(plan.entry),
    '0.28.0 (build 1000005, android fix)'
  );
});

test('a Release Please minor resets the patch to its pubspec floor', () => {
  const plan = planAllocation({
    entries: [entry(BUILD_FLOOR + 9, '0.27.40', sha('a'))],
    sha: sha('b'),
    pubspec: pubspec('0.28.0'),
    ...history(['apps/mobile/ios/Runner/Info.plist']),
  });
  assert.equal(plan.entry.version, '0.28.0');
  assert.equal(plan.entry.shared, true);
});

test('build numbers stay strictly monotonic across a sequence', () => {
  let entries = [];
  let last = 0;
  for (const [index, files] of [
    ['apps/mobile/lib/a.dart'],
    ['apps/mobile/ios/x'],
    ['scripts/desktop-deployment/publish.mjs'],
    ['apps/mobile/pubspec.yaml'],
  ].entries()) {
    const plan = planAllocation({
      entries,
      sha: order[index],
      pubspec: pubspec('0.27.0'),
      ...history(files),
    });
    assert.ok(plan.entry.build > last);
    last = plan.entry.build;
    entries = [plan.entry, ...entries];
  }
  assert.deepEqual(entries.map((item) => item.version).reverse(), [
    '0.27.27',
    '0.27.27',
    '0.27.27',
    '0.27.28',
  ]);
});

test('reserved ref numbers are skipped, even without a valid annotation', () => {
  const plan = planAllocation({
    entries: [entry(BUILD_FLOOR, '0.27.27', sha('a'))],
    reservedBuild: BUILD_FLOOR + 3,
    sha: sha('b'),
    pubspec: pubspec('0.27.0'),
    ...history(['apps/mobile/lib/x.dart']),
  });
  assert.equal(plan.entry.build, BUILD_FLOOR + 4);
});

test('builds follow source order across both workflow orders', () => {
  const run = (entries, commit, files = []) =>
    planAllocation({
      entries,
      sha: commit,
      pubspec: pubspec('0.27.0'),
      ...history(files),
    });
  // Order 1: desktop-only commit c allocates before mobile commit b. Mobile's
  // run for b is superseded (and releases the production head instead), so b
  // never takes a build above c.
  const desktopFirst = [entry(BUILD_FLOOR, '0.27.27', sha('c'))];
  assert.equal(run(desktopFirst, sha('b')).action, 'superseded');
  assert.equal(run(desktopFirst, sha('c')).action, 'reuse');

  // Order 2: mobile allocates b first, then desktop allocates c. Each later
  // run reuses its own entry, a rerun of b's allocation after c is
  // superseded, and builds rise with source order.
  const b = run([], sha('b')).entry;
  const c = run([b], sha('c'), ['scripts/desktop-deployment/x.mjs']).entry;
  assert.ok(c.build > b.build);
  assert.equal(run([c, b], sha('b')).action, 'superseded');
  assert.deepEqual(run([c, b], sha('c')), { action: 'reuse', entry: c });
});

test('classification ignores non-shipping files and labels platform inputs', () => {
  assert.deepEqual(
    classifyChanges([
      'apps/mobile/ios/Runner/AppDelegate.swift',
      'apps/mobile/windows/runner/main.cpp',
      'apps/mobile/vendor/record_ios/ios/Classes/Recorder.swift',
      'scripts/mobile-deployment/play-beta.mjs',
    ]),
    { shared: false, platforms: ['android', 'ios', 'windows'] }
  );
  for (const file of [
    'apps/mobile/test/widget_test.dart',
    'apps/mobile/integration_test/app_test.dart',
    'apps/mobile/README.md',
    'apps/mobile/lib/features/NOTES.md',
    'apps/mobile/analysis_options.yaml',
    'scripts/desktop-deployment/release-topup.test.mjs',
    'scripts/mobile-deployment/test_firebase_service_config.py',
    'apps/web/src/x.ts',
  ])
    assert.deepEqual(classifyChanges([file]), { shared: false, platforms: [] });
  assert.equal(classifyChanges(['apps/mobile/lib/x.dart']).shared, true);
  assert.equal(classifyChanges(['apps/mobile/pubspec.lock']).shared, true);
});

test('annotations must match exactly and cannot smuggle output lines', () => {
  const item = entry(BUILD_FLOOR, '0.27.27', sha('a'));
  assert.deepEqual(
    parseEntry('app-b1000000', entryMessage(item), sha('a')),
    item
  );
  for (const [name, message, target] of [
    ['app-b1000001', entryMessage(item), sha('a')],
    ['app-b1000000', entryMessage(item), sha('b')],
    ['app-b1000000', 'not json', sha('a')],
    ['app-b01000000', entryMessage(item), sha('a')],
    [
      'app-b1000000',
      entryMessage({ ...item, platforms: ['ios\nversion=9.9.9'] }),
      sha('a'),
    ],
    [
      'app-b1000000',
      entryMessage({ ...item, version: '0.27.27\nx=1' }),
      sha('a'),
    ],
    [
      'app-b1000000',
      entryMessage({ ...item, version: '999999.0.0' }),
      sha('a'),
    ],
    ['app-b1000000', JSON.stringify({ ...item, extra: 1 }), sha('a')],
    [
      'app-b1000000',
      entryMessage({ ...item, platforms: ['ios', 'ios'] }),
      sha('a'),
    ],
  ])
    assert.equal(parseEntry(name, message, target), null, message);
  assert.deepEqual(outputLines({ action: 'reuse', entry: item }), [
    'superseded=false',
    'version=0.27.27',
    'build=1000000',
    'label=0.27.27 (build 1000000)',
  ]);
  assert.deepEqual(outputLines({ action: 'superseded', latest: item }), [
    'superseded=true',
  ]);
});

test('Windows Store versions keep order with a nonzero first part', () => {
  assert.equal(windowsPackageVersion('0.27.27'), '1.27.27.0');
  assert.equal(windowsPackageVersion('1.0.0'), '2.0.0.0');
  assert.throws(() => windowsPackageVersion('0.70000.0'));
});

test('cat-file batch output parses annotated tags and skips other objects', () => {
  const message = entryMessage(entry(BUILD_FLOOR, '0.27.27', sha('a')));
  const tag = `object ${sha('a')}\ntype commit\ntag app-b1000000\ntagger x <x> 0 +0000\n\n${message}\n`;
  const output = Buffer.from(
    `${sha('e')} tag ${Buffer.byteLength(tag)}\n${tag}\n${sha('f')} missing\n`
  );
  assert.deepEqual(parseTagObjects(output), [
    { name: 'app-b1000000', target: sha('a'), message },
  ]);
});

// A fake origin shared by concurrent allocators: refs plus tag objects.
function fakeOrigin() {
  const refs = new Map();
  const objects = new Map();
  const git = (snapshot) => ({
    fetchLedger() {
      snapshot.refs = new Map(refs);
    },
    read() {
      const run = (args, input) => {
        if (args[0] === 'for-each-ref')
          return Buffer.from(
            [...snapshot.refs]
              .map(
                ([name, ref]) =>
                  `${name} ${ref.type} ${ref.object} ${ref.peeled}`
              )
              .join('\n')
          );
        return Buffer.concat(
          input
            .trim()
            .split('\n')
            .map((id) => {
              const body = objects.get(id);
              return Buffer.from(
                `${id} tag ${Buffer.byteLength(body)}\n${body}\n`
              );
            })
        );
      };
      return readLedger(run);
    },
    ...history(['apps/mobile/lib/x.dart']),
  });
  const request = async (path, { method = 'GET', body } = {}) => {
    if (path.endsWith('/git/tags') && method === 'POST') {
      const id = `${objects.size}`.padStart(40, 'f');
      objects.set(
        id,
        `object ${body.object}\ntype commit\ntag ${body.tag}\ntagger ci <ci> 0 +0000\n\n${body.message}\n`
      );
      return { sha: id };
    }
    if (path.endsWith('/git/refs') && method === 'POST') {
      const name = body.ref.replace('refs/tags/', '');
      if (refs.has(name)) {
        const error = new Error('exists');
        error.status = 422;
        throw error;
      }
      const peeled = objects.get(body.sha).split('\n')[0].slice(7);
      refs.set(name, { type: 'tag', object: body.sha, peeled });
      return {};
    }
    throw new Error(`unexpected ${method} ${path}`);
  };
  return { refs, git, request };
}

test('a lost create race re-reads the ledger and reuses the winner', async () => {
  const origin = fakeOrigin();
  const first = await allocate({
    request: origin.request,
    sha: sha('a'),
    pubspec: pubspec('0.27.0'),
    git: origin.git({}),
  });
  // The second writer's first read predates the winner's ref.
  const snapshot = { refs: new Map() };
  const loser = origin.git(snapshot);
  let reads = 0;
  const second = await allocate({
    request: origin.request,
    sha: sha('a'),
    pubspec: pubspec('0.27.0'),
    git: {
      ...loser,
      fetchLedger() {
        if (reads++ > 0) loser.fetchLedger();
      },
    },
  });
  assert.equal(first.action, 'create');
  assert.equal(second.action, 'reuse');
  assert.deepEqual(second.entry, first.entry);
  assert.equal(origin.refs.size, 1);
});

test('read-only callers reuse an entry and never create one', async () => {
  const origin = fakeOrigin();
  await allocate({
    request: origin.request,
    sha: sha('a'),
    pubspec: pubspec('0.27.0'),
    git: origin.git({}),
  });
  const found = await allocate({
    request: origin.request,
    sha: sha('a'),
    git: origin.git({}),
    reuseOnly: true,
  });
  assert.equal(found.entry.version, '0.27.27');
  await assert.rejects(
    allocate({
      request: origin.request,
      sha: sha('b'),
      git: origin.git({}),
      reuseOnly: true,
    }),
    /No release ledger entry/
  );
  assert.equal(origin.refs.size, 1);
});

test('a lightweight ref reserves its number', async () => {
  const origin = fakeOrigin();
  origin.refs.set('app-b1000000', {
    type: 'commit',
    object: sha('a'),
    peeled: '',
  });
  const plan = await allocate({
    request: origin.request,
    sha: sha('a'),
    pubspec: pubspec('0.27.0'),
    git: origin.git({}),
  });
  assert.equal(plan.entry.build, BUILD_FLOOR + 1);
});

test('the Apple guard resumes, refuses closed or behind trains, and newer builds', () => {
  const base = {
    version: '0.27.27',
    build: 1000002,
    trains: ['0.27.20', '0.27.27'],
    exact: [],
    trainBuilds: [1000000],
    storeStates: [],
  };
  assert.deepEqual(decideAppleUpload(base), { present: false });
  assert.deepEqual(
    decideAppleUpload({ ...base, exact: [{ version: '0.27.27' }] }),
    { present: true }
  );
  assert.throws(
    () => decideAppleUpload({ ...base, exact: [{ version: '0.27.26' }] }),
    /already exists for version/
  );
  assert.throws(
    () => decideAppleUpload({ ...base, storeStates: ['READY_FOR_SALE'] }),
    /released or approved/
  );
  assert.throws(
    () => decideAppleUpload({ ...base, trains: ['0.28.0'] }),
    /behind 0.28.0/
  );
  assert.throws(
    () => decideAppleUpload({ ...base, trainBuilds: [1000005] }),
    /newer build 1000005/
  );
});

test('publish-time staleness uses the compare API, not local history', async () => {
  const origin = fakeOrigin();
  for (const commit of [sha('a'), sha('b')])
    await allocate({
      request: origin.request,
      sha: commit,
      pubspec: pubspec('0.27.0'),
      git: origin.git({}),
    });
  const compare = (status) => async (path) => {
    assert.match(path, new RegExp(`/compare/${sha('a')}\\.\\.\\.${sha('b')}$`));
    return { status };
  };
  assert.equal(
    await isStale({
      request: compare('ahead'),
      sha: sha('a'),
      git: origin.git({}),
    }),
    true
  );
  assert.equal(
    await isStale({
      request: compare('behind'),
      sha: sha('a'),
      git: origin.git({}),
    }),
    false
  );
  await assert.rejects(
    isStale({
      request: compare('diverged'),
      sha: sha('a'),
      git: origin.git({}),
    }),
    /diverged/
  );
  // The newest commit is never stale and needs no compare call.
  assert.equal(
    await isStale({
      request: async () => {
        throw new Error('no call expected');
      },
      sha: sha('b'),
      git: origin.git({}),
    }),
    false
  );
  await assert.rejects(
    isStale({ request: compare('ahead'), sha: sha('c'), git: origin.git({}) }),
    /no release ledger entry/
  );
});
