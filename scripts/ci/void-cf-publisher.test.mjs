import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  assign,
  cfCommand,
  publish,
  readBack,
  servingVersion,
  settledServing,
  awaitServedBuild,
  verifyVersion,
} from './void-cf-publisher.mjs';

const V1 = '11111111-1111-4111-8111-111111111111';
const V2 = '22222222-2222-4222-8222-222222222222';

const workerConfig = {
  env: {
    FLAG: { type: 'text', value: 'off' },
    TOKEN: { type: 'secret' },
    GUARD: { type: 'worker', worker: 'guard', exportName: 'GuardEntrypoint' },
    LIVE: { type: 'unsafe:durable_object_namespace', class_name: 'LiveObject' },
  },
};
const receipt = {
  worker: 'app',
  migrationTag: 'live-v1',
  varOverrides: ['FLAG'],
};
const live = () => ({
  migration_tag: 'live-v1',
  bindings: [
    { name: 'TOKEN', type: 'secret_text' },
    {
      name: 'GUARD',
      type: 'service',
      service: 'guard',
      entrypoint: 'GuardEntrypoint',
      environment: 'production',
    },
    {
      name: 'LIVE',
      type: 'durable_object_namespace',
      class_name: 'LiveObject',
      namespace_id: 'ns-1',
    },
  ],
});
const uploaded = () => {
  const version = live();
  version.bindings.push({ name: 'FLAG', type: 'plain_text', text: 'off' });
  return version;
};

test('accepts an upload matching the emitted and serving bindings', () => {
  assert.deepEqual(
    verifyVersion({
      workerConfig,
      receipt,
      uploaded: uploaded(),
      live: live(),
      strict: true,
    }),
    []
  );
});

test('rejects namespace, tag, shape and inventory drift', () => {
  const moved = uploaded();
  moved.bindings[2].namespace_id = 'ns-2';
  moved.migration_tag = 'live-v2';
  moved.bindings[1].entrypoint = undefined;
  moved.bindings.push({ name: 'EXTRA', type: 'plain_text', text: 'x' });
  const problems = verifyVersion({
    workerConfig,
    receipt,
    uploaded: moved,
    live: live(),
    strict: true,
  });
  assert.ok(problems.includes('LIVE: Durable Object namespace changed'));
  assert.ok(
    problems.includes('uploaded migration tag differs from the serving version')
  );
  assert.ok(problems.includes('GUARD: entrypoint differs'));
  assert.ok(problems.includes('EXTRA: unexpected uploaded binding'));
});

test('accepts secrets inherited from the serving version only', () => {
  const before = live();
  before.bindings.push({ name: 'EXTRA_SECRET', type: 'secret_text' });
  const after = uploaded();
  after.bindings.push({ name: 'EXTRA_SECRET', type: 'secret_text' });
  assert.deepEqual(
    verifyVersion({
      workerConfig,
      receipt,
      uploaded: after,
      live: before,
      strict: true,
    }),
    []
  );
  assert.deepEqual(
    verifyVersion({ workerConfig, receipt, uploaded: after, live: live() }),
    ['EXTRA_SECRET: unexpected uploaded binding']
  );
});

test('strict mode only allows the declared variable overrides', () => {
  const before = live();
  before.bindings.push({ name: 'OLD', type: 'plain_text', text: 'x' });
  const problems = verifyVersion({
    workerConfig,
    receipt,
    uploaded: uploaded(),
    live: before,
    strict: true,
  });
  assert.deepEqual(problems, ['OLD: differs from the serving version']);
  assert.deepEqual(
    verifyVersion({
      workerConfig,
      receipt,
      uploaded: uploaded(),
      live: before,
      strict: false,
    }),
    []
  );
});

test('rejects missing namespaces and changed Worker settings', () => {
  const missing = uploaded();
  delete missing.bindings[2].namespace_id;
  const before = live();
  delete before.bindings[2].namespace_id;
  assert.ok(
    verifyVersion({
      workerConfig,
      receipt,
      uploaded: missing,
      live: before,
    }).includes('LIVE: Durable Object namespace changed')
  );
  const config = {
    ...workerConfig,
    compatibilityDate: '2026-09-06',
    compatibilityFlags: ['nodejs_compat'],
    placement: { region: 'aws:ap-southeast-1' },
    manifest: { mainModule: 'index.js' },
  };
  const drifted = {
    ...uploaded(),
    compatibility_date: '2026-09-06',
    compatibility_flags: [],
    main_module: 'index.js',
  };
  assert.deepEqual(
    verifyVersion({
      workerConfig: config,
      receipt,
      uploaded: drifted,
      live: live(),
    }),
    [
      'compatibility_flags differs from the emitted output',
      'placement differs from the emitted output',
    ]
  );
});

test('picks the newest deployment regardless of list order', () => {
  assert.equal(
    servingVersion({
      deployments: [
        {
          created_on: '2026-11-20T10:00:00Z',
          versions: [{ version_id: V1, percentage: 100 }],
        },
        {
          created_on: '2026-11-20T11:00:00Z',
          versions: [{ version_id: V2, percentage: 100 }],
        },
      ],
    }),
    V2
  );
});

test('refuses split traffic as the serving version', () => {
  assert.equal(
    servingVersion({
      deployments: [{ versions: [{ version_id: V1, percentage: 100 }] }],
    }),
    V1
  );
  assert.throws(
    () =>
      servingVersion({
        deployments: [
          {
            versions: [
              { version_id: V1, percentage: 50 },
              { version_id: V2, percentage: 50 },
            ],
          },
        ],
      }),
    /split/
  );
});

function fakeCf(state) {
  const calls = [];
  const exec = (bin, args) => {
    const cli = args.slice(args.indexOf('cf') + 1).join(' ');
    calls.push(cli);
    if (cli.startsWith('workers deployments list'))
      return JSON.stringify({
        deployments: [
          { versions: [{ version_id: state.serving, percentage: 100 }] },
        ],
      });
    if (cli.startsWith('workers deployments create')) {
      state.serving = JSON.parse(args.at(-1))[0].version_id;
      return '{}';
    }
    if (cli.startsWith(`workers versions get ${V1}`))
      return JSON.stringify(state.live);
    if (cli.startsWith(`workers versions get ${V2}`))
      return JSON.stringify(uploaded());
    if (cli.startsWith('workers versions create'))
      return `Worker Version ID: ${V2}\n`;
    throw new Error(`unexpected cf ${cli}`);
  };
  return { calls, exec, env: {}, sleep: () => {} };
}

test('assign refuses to move traffic when the serving version changed', () => {
  const state = { serving: V2 };
  const deps = fakeCf(state);
  assert.throws(
    () => assign({ worker: 'app', version: V2, expectCurrent: V1 }, deps),
    /serving version moved since capture/
  );
  assert.ok(
    !deps.calls.some((call) => call.startsWith('workers deployments create'))
  );
  state.serving = V1;
  assert.deepEqual(
    assign({ worker: 'app', version: V2, expectCurrent: V1 }, deps),
    {
      worker: 'app',
      previousVersionId: V1,
      versionId: V2,
    }
  );
});

function buildDir(migrationTag) {
  const build = mkdtempSync(join(tmpdir(), 'void-cf-publisher-'));
  const dir = join(build, '.cloudflare/output/v0/workers/default');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'worker.config.json'), JSON.stringify(workerConfig));
  writeFileSync(
    join(build, 'void-cf-receipt.json'),
    JSON.stringify({ ...receipt, migrationTag })
  );
  return build;
}

test('publish uploads without traffic and proves the version', () => {
  const build = buildDir('live-v1');
  try {
    const deps = fakeCf({ serving: V1, live: live() });
    assert.deepEqual(
      publish({ build, worker: 'app', message: 'sha', strict: true }, deps),
      {
        worker: 'app',
        versionId: V2,
        previousVersionId: V1,
        strict: true,
      }
    );
    assert.ok(
      !deps.calls.some((call) => call.startsWith('workers deployments create'))
    );
  } finally {
    rmSync(build, { recursive: true, force: true });
  }
});

test('publish refuses a pending tag migration before uploading', () => {
  const build = buildDir('live-v2');
  try {
    const deps = fakeCf({ serving: V1, live: live() });
    assert.throws(
      () => publish({ build, worker: 'app', message: 'sha' }, deps),
      /pending Durable Object migration/
    );
    assert.ok(
      !deps.calls.some((call) => call.startsWith('workers versions create'))
    );
  } finally {
    rmSync(build, { recursive: true, force: true });
  }
});

test('readBack retries a propagating version, then gives up', () => {
  let calls = 0;
  const waits = [];
  const notYet = Object.assign(new Error('cf failed'), {
    stderr: '404 Not Found [10007]',
  });
  assert.equal(
    readBack(
      () => {
        calls += 1;
        if (calls < 3) throw notYet;
        return 'ok';
      },
      { sleep: (ms) => waits.push(ms) }
    ),
    'ok'
  );
  assert.deepEqual(waits, [5000, 10000]);
  assert.throws(
    () =>
      readBack(
        () => {
          throw notYet;
        },
        { sleep: () => {}, attempts: 2 }
      ),
    /cf failed/
  );
  const denied = Object.assign(new Error('denied'), {
    stderr: '403 Forbidden',
  });
  let deniedCalls = 0;
  assert.throws(
    () =>
      readBack(
        () => {
          deniedCalls += 1;
          throw denied;
        },
        { sleep: () => {} }
      ),
    /denied/
  );
  assert.equal(deniedCalls, 1);
});

test('resolves the pinned cf CLI that supplies the Build Output schemas', () => {
  const [command, prefix] = cfCommand({});
  assert.equal(command, process.execPath);
  assert.match(prefix[0], /[\\/]cf[\\/]bin[\\/]cf$/);
  assert.deepEqual(cfCommand({ CF_BIN: '/opt/cf' }), ['/opt/cf', []]);
  assert.throws(
    () => cfCommand({}, () => '/nonexistent/cf/package.json'),
    /cf CLI missing/
  );
});

test('accepts several secrets inherited from the serving version', () => {
  const names = ['SECRET_A', 'SECRET_B', 'SECRET_C', 'SECRET_D'];
  const before = live();
  const after = uploaded();
  for (const name of names) {
    before.bindings.push({ name, type: 'secret_text' });
    after.bindings.push({ name, type: 'secret_text' });
  }
  assert.deepEqual(
    verifyVersion({ workerConfig, receipt, uploaded: after, live: before }),
    []
  );
  assert.deepEqual(
    verifyVersion({
      workerConfig,
      receipt,
      uploaded: after,
      live: before,
      strict: true,
    }),
    []
  );
});

function listing(id) {
  return JSON.stringify({
    deployments: [{ versions: [{ version_id: id, percentage: 100 }] }],
  });
}

function sequenceCf(reads) {
  const calls = [];
  const exec = (bin, args) => {
    const cli = args.join(' ');
    calls.push(cli);
    if (cli.startsWith('workers deployments list'))
      return listing(reads.length > 1 ? reads.shift() : reads[0]);
    if (cli.startsWith('workers deployments create')) return '{}';
    throw new Error(`unexpected cf ${cli}`);
  };
  return { calls, exec, env: {}, sleep: () => {} };
}

test('a stale deployment read cannot satisfy expect-current', () => {
  // The first read is a stale snapshot; the settled answer is V2.
  const deps = sequenceCf([V1, V2, V2, V2]);
  assert.throws(
    () => assign({ worker: 'app', version: V2, expectCurrent: V1 }, deps),
    /serving version moved since capture/
  );
  assert.ok(
    !deps.calls.some((call) => call.startsWith('workers deployments create'))
  );
});

test('assign waits until reads settle on the new version', () => {
  const deps = sequenceCf([V1, V1, V1, V1, V2, V2, V2]);
  assert.deepEqual(
    assign({ worker: 'app', version: V2, expectCurrent: V1 }, deps),
    {
      worker: 'app',
      previousVersionId: V1,
      versionId: V2,
    }
  );
  assert.throws(
    () =>
      settledServing(
        'app',
        { ...sequenceCf([V1]), attempts: 4 },
        { target: V2 }
      ),
    /did not settle on/
  );
});

test('assign proves the public build identity before and after', () => {
  const served = ['old-sha', 'old-sha', 'new-sha', 'new-sha', 'new-sha'];
  const deps = {
    ...sequenceCf([V1, V1, V1, V2, V2, V2]),
    fetchBuild: () => (served.length > 1 ? served.shift() : served[0]),
  };
  assert.deepEqual(
    assign(
      {
        worker: 'app',
        version: V2,
        expectCurrent: V1,
        buildInfoUrl: 'https://app/build',
        expectBuild: 'new-sha',
      },
      deps
    ),
    {
      worker: 'app',
      previousVersionId: V1,
      versionId: V2,
      servedBefore: 'old-sha',
      servedAfter: 'new-sha',
    }
  );
  assert.throws(
    () =>
      awaitServedBuild('https://app/build', 'new-sha', {
        fetchBuild: () => 'old-sha',
        sleep: () => {},
      }),
    /did not serve new-sha/
  );
});
