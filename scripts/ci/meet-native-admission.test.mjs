import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  mkdir,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { meetFixture } from './meet-native-fixture.mjs';
import { createMeetGraph } from './meet-native-graph.mjs';
import {
  assertMeetCopy,
  prepareMeetGraph,
} from './meet-native-graph-files.mjs';
import { admitMeetPolicies, createMeetPolicy } from './meet-native-policy.mjs';
import probe from './meet-native-probe.mjs';
import {
  admitApp,
  admitProbe,
  admitRegistry,
  assertMeetOriginal,
  inspectMeetGraph,
  probeConfig,
} from './meet-native-profile.mjs';

test('finite Meet admission preserves full config, manifest and typed edges', async (t) => {
  const f = await meetFixture(t),
    plan = await inspectMeetGraph(f.options);
  assert.equal(plan.profile, 'meet-emitted-v1');
  assert.ok(Object.isFrozen(plan.config.services));
  assert.equal(plan.seal['empty-directory/'], null);
  assert.equal(plan.edges.length, 7);
  assert.equal(plan.config.r2_buckets[0].binding, 'NEXT_INC_CACHE_R2_BUCKET');
  assert.deepEqual(plan.config.images, { binding: 'IMAGES' });
  assert.equal(plan.config.configPath, f.normalization.inputPath);
  const prepared = await prepareMeetGraph(plan, f.context);
  await assertMeetCopy(plan, prepared, true);
  assert.deepEqual(await readdir(prepared.registry), []);
  assert.deepEqual(
    await readFile(prepared.roles.app.config),
    await readFile(join(f.app, 'dist/ssr/wrangler.json'))
  );
  await assert.rejects(inspectMeetGraph({ ...f.options, externalWorkers: [] }));
  await assert.rejects(assertMeetOriginal({ ...plan, unknown: true }));
  const tampered = structuredClone(plan);
  tampered.probeConfig.services[0].service = 'ambient';
  await assert.rejects(assertMeetOriginal(tampered));
});

const mutations = {
  flags: (c) => {
    c.compatibility_flags.reverse();
  },
  date: (c) => {
    c.compatibility_date = '2026-09-07';
  },
  extra: (c) => {
    c.extra = {};
  },
  remoteR2: (c) => {
    c.r2_buckets[0].remote = true;
  },
  remoteImages: (c) => {
    c.images.remote = true;
  },
  missingR2: (c) => {
    delete c.r2_buckets;
  },
  extraNamespace: (c) => {
    c.durable_objects.bindings.push({ name: 'EXTRA', class_name: 'Foreign' });
  },
  nonSQLite: (c) => {
    c.migrations[0].new_sqlite_classes = [];
  },
  selfReference: (c) => {
    c.services[0].service = 'ambient-worker';
  },
  customBuild: (c) => {
    c.build = { command: 'forbidden' };
  },
  extraEntry: (c) => {
    c.env = { other: {} };
  },
  moduleRules: (c) => {
    c.rules[0].globs = ['../**/*'];
  },
  metadata: (c) => {
    c.configPath = '/ambient/wrangler.json';
  },
  activeDefault: (c) => {
    c.queues.producers.push({ binding: 'REMOTE', queue: 'remote' });
  },
};
for (const [name, mutate] of Object.entries(mutations))
  test(`Meet profile rejects ${name} without SDK load`, async (t) => {
    const f = await meetFixture(t);
    mutate(f.config);
    assert.throws(() => admitApp(f.config, f.normalization));
    await f.save();
    await assert.rejects(inspectMeetGraph(f.options));
  });

test('source, seal, pointer, module/root escape and symlink negatives fail admission', async (t) => {
  const f = await meetFixture(t);
  await assert.rejects(
    inspectMeetGraph({ ...f.options, sourceSHA: 'b'.repeat(40) })
  );
  const plan = await inspectMeetGraph(f.options);
  await writeFile(join(f.app, 'dist/client/asset.js'), 'mutated');
  await assert.rejects(assertMeetOriginal(plan));
  await f.save();
  const next = await inspectMeetGraph(f.options);
  await mkdir(join(f.app, 'dist/added-empty-directory'));
  await assert.rejects(assertMeetOriginal(next));
  await rm(join(f.app, 'dist/added-empty-directory'), { recursive: true });
  await writeFile(
    f.pointerPath,
    JSON.stringify({
      configPath: '../../dist/ssr/wrangler.json',
      auxiliaryWorkers: ['ambient'],
    })
  );
  await assert.rejects(inspectMeetGraph(f.options));
  await writeFile(
    f.pointerPath,
    JSON.stringify({
      configPath: '../../dist/ssr/wrangler.json',
      auxiliaryWorkers: [],
    })
  );
  f.config.main = '../../../outside.mjs';
  await f.save();
  await assert.rejects(inspectMeetGraph(f.options));
  f.config.main = 'main.mjs';
  await f.save();
  await symlink(
    join(f.app, 'dist/ssr/main.mjs'),
    join(f.app, 'dist/extra.mjs')
  );
  await assert.rejects(inspectMeetGraph(f.options));
  await rm(join(f.app, 'dist/extra.mjs'));
  await rm(join(f.app, 'meet-artifact.json'));
  await assert.rejects(inspectMeetGraph(f.options), /seal is required/);
});

test('probe admits only its exact two binding edges and sealed entry', () => {
  admitProbe(probeConfig());
  for (const change of [
    (c) => {
      c.migrations = [];
    },
    (c) => {
      c.assets = {};
    },
    (c) => {
      c.services[0].service = 'foreign';
    },
    (c) => {
      c.durable_objects.bindings[0].script_name = 'foreign';
    },
    (c) => {
      c.durable_objects.bindings.push({ name: 'EXTRA' });
    },
    (c) => {
      c.main = '../ambient.mjs';
    },
    (c) => {
      c.build = { command: 'forbidden' };
    },
  ]) {
    const config = probeConfig();
    change(config);
    assert.throws(() => admitProbe(config));
  }
});

test('both authentic role handlers are mandatory before SDK/temp admission', async () => {
  const app = createMeetPolicy('app'),
    other = createMeetPolicy('probe');
  admitMeetPolicies({ app, probe: other });
  for (const policies of [
    { app },
    { app: other, probe: app },
    { app: { ...app }, probe: other },
    { app, probe: { ...other, handler() {} } },
  ]) {
    assert.throws(() => admitMeetPolicies(policies));
    await assert.rejects(createMeetGraph({}, {}, { policies }));
  }
});

const cookie =
  'tuturuuu_app_session=ttr_app_a.b.c; tuturuuu_web_app_session=ttr_app_d.e.f';
const fixtureURL =
  'https://tuturuuu.com/api/v1/meet-ci-rewrite?repeat=one&repeat=two';
function positive(url = fixtureURL, init = {}) {
  return new Request(url, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: '{"fixture":true}',
    ...init,
  });
}
test('bounded positive central fixture preserves exact query/body/cookies and is single use', async () => {
  const policy = createMeetPolicy('app');
  const response = await policy.handler(positive());
  assert.equal(response.status, 207);
  assert.deepEqual(await response.json(), { fixture: 'central-web-api' });
  assert.match(response.headers.get('set-cookie'), /^meet_ci_upstream=one;/);
  assert.deepEqual(policy.forwarded, [
    {
      method: 'POST',
      query: '?repeat=one&repeat=two',
      cookie,
      body: '{"fixture":true}',
    },
  ]);
  assert.equal((await policy.handler(positive())).status, 599);
  assert.equal(policy.unexpected.length, 1);
});
test('HTTP allowlist denies method, redirect/lookalike, query, body, cookie and role mismatches', async () => {
  const requests = [
    positive(
      'https://tuturuuu.com.evil.invalid/api/v1/meet-ci-rewrite?repeat=one&repeat=two'
    ),
    positive(
      'http://tuturuuu.com/api/v1/meet-ci-rewrite?repeat=one&repeat=two'
    ),
    positive(
      'https://tuturuuu.com:444/api/v1/meet-ci-rewrite?repeat=one&repeat=two'
    ),
    positive('http://127.0.0.1/'),
    positive('http://10.0.0.1/'),
    positive(
      'https://tuturuuu.com/api/v1/meet-ci-rewrite/redirect?repeat=one&repeat=two'
    ),
    positive(
      'https://tuturuuu.com/api/v1/meet-ci-rewrite?repeat=two&repeat=one'
    ),
    positive(fixtureURL, { method: 'PUT' }),
    positive(fixtureURL, { body: 'x'.repeat(129) }),
    positive(fixtureURL, { body: '{"fixture":false}' }),
    positive(fixtureURL, {
      headers: { cookie: 'unrelated', 'content-type': 'application/json' },
    }),
    positive(fixtureURL, {
      headers: {
        cookie: `${cookie}; ${'x'.repeat(8192)}`,
        'content-type': 'application/json',
      },
    }),
  ];
  for (const request of requests) {
    const policy = createMeetPolicy('app'),
      response = await policy.handler(request);
    assert.equal(response.status, 599);
    assert.equal(await response.text(), 'Unexpected fixture egress');
    assert.equal(response.headers.get('location'), null);
    assert.equal(policy.forwarded.length, 0);
    assert.equal(policy.unexpected.length, 1);
  }
  assert.equal(
    (await createMeetPolicy('probe').handler(positive())).status,
    599
  );
});
test('negative controls require the exact tagged hook invocation and bounded counts', async () => {
  const policy = createMeetPolicy('probe');
  policy.expectDenial('GET', 'http://localhost/');
  assert.throws(() => policy.assertControls(1), /did not run/);
  assert.equal(
    (await policy.handler(new Request('http://localhost/'))).status,
    599
  );
  policy.assertControls(1);
  await policy.handler(new Request('http://localhost/'));
  assert.throws(() => policy.assertControls(1));
  for (let i = 0; i < 30; i++)
    await policy.handler(new Request('http://localhost/'));
  await assert.rejects(
    policy.handler(new Request('http://localhost/')),
    /operation bound/
  );
});

test('probe dispatch calls external namespace/named service and rejects open URLs', async () => {
  const calls = [],
    token = randomUUID() + randomUUID(),
    name = `ci-${randomUUID()}`;
  const env = {
    PROBE_TOKEN: token,
    LIVE: {
      idFromName(value) {
        calls.push(value);
        return value;
      },
      get(value) {
        return {
          fetch(url) {
            calls.push([value, url]);
            return new Response('', { status: 401 });
          },
        };
      },
    },
    PROVIDER: {
      fetch(url) {
        calls.push(url);
        return new Response('', { status: 403 });
      },
    },
  };
  const request = (path, auth = token) =>
    new Request(`https://meet-ci-probe.invalid${path}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${auth}` },
    });
  assert.equal(
    (await probe.fetch(request(`/live-empty?name=${name}`), env)).status,
    401
  );
  assert.deepEqual(calls, [
    name,
    [name, 'https://meet.tuturuuu.com/live-connect'],
  ]);
  assert.equal(
    (await probe.fetch(request('/provider-invalid'), env)).status,
    403
  );
  assert.equal(calls[2], 'https://untrusted.invalid/provider');
  for (const path of [
    '/live-empty?name=foreign',
    '/egress-denied/99',
    '/provider-invalid?url=https://evil.invalid',
    '/fetch?url=https://evil.invalid',
  ])
    assert.equal((await probe.fetch(request(path), env)).status, 403);
  assert.equal(
    (await probe.fetch(request('/provider-invalid', 'wrong'), env)).status,
    403
  );
  assert.equal(calls.length, 3);
});

function registry() {
  return Object.fromEntries(
    ['tuturuuu-meet', 'meet-ci-binding-probe'].map((name, i) => [
      name,
      {
        mtimeMs: 100,
        value: {
          instanceId: `session-${i}`,
          debugPortAddress: `127.0.0.1:${1234 + i}`,
          userWorkerService: `core:user:${name}`,
          defaultEntrypointService: i
            ? `core:user:${name}`
            : `assets:rpc-proxy:${name}`,
        },
      },
    ])
  );
}
test('registry rejects stale, foreign, extra, missing and non-loopback records', () => {
  admitRegistry(registry(), 100);
  for (const mutate of [
    (r) => {
      r.foreign = r['tuturuuu-meet'];
    },
    (r) => {
      delete r['tuturuuu-meet'];
    },
    (r) => {
      r['tuturuuu-meet'].mtimeMs = 99;
    },
    (r) => {
      r['tuturuuu-meet'].value.debugPortAddress = '10.0.0.1:1234';
    },
    (r) => {
      r['tuturuuu-meet'].value.userWorkerService = 'foreign';
    },
    (r) => {
      r['tuturuuu-meet'].value.queueConsumers = ['ambient'];
    },
    (r) => {
      r['tuturuuu-meet'].value.instanceId = 'session-1';
    },
  ]) {
    const r = registry();
    mutate(r);
    assert.throws(() => admitRegistry(r, 100));
  }
});
