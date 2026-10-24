import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  captureAfter,
  captureBefore,
  compareTransition,
  settingsPlan,
} from './cf-worker-settings.mjs';

const CRON_CONTROL = JSON.parse(
  readFileSync(
    new URL('./fixtures/cf-worker-parity/cron-control.json', import.meta.url),
    'utf8'
  )
);
const plan = settingsPlan(CRON_CONTROL);
const accountId = CRON_CONTROL.identity.accountId;

/** Cloudflare settings bindings for a recorded identity. */
function bindingsFor(identity) {
  return [
    ...Object.entries(identity.vars).map(([name, text]) => ({
      name,
      type: 'plain_text',
      text,
    })),
    ...identity.secrets.map((name) => ({ name, type: 'secret_text' })),
    ...Object.entries(identity.durableObjects).map(([name, { className }]) => ({
      name,
      type: 'durable_object_namespace',
      class_name: className,
      namespace_id: `namespace-${className}`,
    })),
  ];
}

/** Fake read-only API whose live Worker matches `identity` (plus overrides). */
function liveWorker(identity, { settings = {}, ...overrides } = {}) {
  const responses = {
    settings: {
      compatibility_date: identity.compatibilityDate,
      compatibility_flags: identity.compatibilityFlags,
      usage_model: 'standard',
      observability: { enabled: true, head_sampling_rate: 0.05 },
      bindings: bindingsFor(identity),
      ...settings,
    },
    subdomain: { enabled: true, previews_enabled: true },
    schedules: { schedules: identity.crons.map((cron) => ({ cron })) },
    secrets: identity.secrets.map((name) => ({ name })),
    domains: [],
    zones: [],
    deployments: {
      deployments: [{ id: 'live', versions: [{ version_id: 'v' }] }],
    },
    ...overrides,
  };
  const calls = [];
  return {
    calls,
    fetchImpl: async (url, init) => {
      assert.equal(init.method, 'GET');
      calls.push(url);
      const key = url.includes('/zones?') ? 'zones' : url.split('/').at(-1);
      assert.ok(Object.hasOwn(responses, key), `unexpected endpoint ${url}`);
      return {
        ok: true,
        json: async () => ({ success: true, result: responses[key] }),
      };
    },
  };
}
const credentials = (api) => ({
  accountId,
  token: 'disposable-fixture',
  fetchImpl: api.fetchImpl,
});

test('cron-control records a reviewed transition from the live identity', () => {
  assert.match(plan.transition.decision, /^CRON-LEDGER-1:/);
  assert.deepEqual(plan.previous.crons, ['*/5 * * * *']);
  assert.deepEqual(Object.keys(plan.previous.vars), ['WEB_ORIGIN']);
  assert.deepEqual(plan.previous.durableObjects, {});
  assert.equal(plan.target.crons.length, 9);
  assert.deepEqual(plan.target.durableObjectClasses, { CronLedger: 'sqlite' });
  assert.equal(plan.target.vars.CRON_CONTROL_ENABLED_JOBS, '');
  assert.equal(plan.target.vars.CRON_CONTROL_WORKER_PROCESSORS, '');
});

test('baselines without a transition keep the single expected identity', () => {
  const { identity } = CRON_CONTROL;
  assert.deepEqual(settingsPlan({ identity }), { target: identity });
});

for (const [label, change, error] of [
  ['half-declared', { transition: undefined }, /both previousIdentity/],
  [
    'unnamed decision',
    { transition: { ...CRON_CONTROL.transition, decision: ' ' } },
    /decision/,
  ],
  [
    'unsupported field',
    {
      transition: {
        ...CRON_CONTROL.transition,
        fields: [...CRON_CONTROL.transition.fields, 'secrets'],
      },
    },
    /transition.fields/,
  ],
  [
    'undeclared change',
    {
      previousIdentity: {
        ...CRON_CONTROL.previousIdentity,
        compatibilityDate: '2026-01-01',
      },
    },
    /may not change compatibilityDate/,
  ],
  [
    'unchanged declared field',
    {
      transition: {
        ...CRON_CONTROL.transition,
        fields: [...CRON_CONTROL.transition.fields, 'routes'],
      },
    },
    /transition.fields/,
  ],
  [
    'stale transition',
    {
      previousIdentity: {
        ...CRON_CONTROL.identity,
        crons: CRON_CONTROL.previousIdentity.crons,
      },
    },
    /vars does not change/,
  ],
])
  test(`transition plan rejects a ${label} baseline`, () => {
    assert.throws(() => settingsPlan({ ...CRON_CONTROL, ...change }), error);
  });

test('first publication: previous live settings may move only to the target', async () => {
  const live = liveWorker(plan.previous);
  const before = await captureBefore({ plan, ...credentials(live) });
  assert.equal(before.stage, 'previous');
  assert.equal(live.calls.length, 7, 'one bounded read for both stages');
  const published = liveWorker(plan.target);
  const after = await captureAfter({ plan, ...credentials(published) });
  assert.equal(after.stage, 'target');
  assert.notEqual(after.settingsHash, before.settingsHash);
  assert.deepEqual(after.bindings.durableObjects, {
    CRON_LEDGER: { className: 'CronLedger' },
  });
  compareTransition(plan, before, after);
  const text = JSON.stringify([before, after]);
  for (const value of Object.values(plan.target.vars).filter(Boolean))
    assert.ok(!text.includes(value), 'snapshots never persist text values');
});

test('first publication still blocks changes outside the transition', async () => {
  const before = await captureBefore({
    plan,
    ...credentials(liveWorker(plan.previous)),
  });
  for (const overrides of [
    { settings: { usage_model: 'unbound' } },
    { secrets: [...plan.target.secrets, 'EXTRA'].map((name) => ({ name })) },
    { subdomain: { enabled: true, previews_enabled: true, extra: true } },
  ]) {
    const after = await captureAfter({
      plan,
      ...credentials(liveWorker(plan.target, overrides)),
    });
    assert.throws(
      () => compareTransition(plan, before, after),
      /acceptance is blocked/
    );
  }
});

test('after publication the live Worker must match the target', async () => {
  for (const live of [
    liveWorker(plan.previous),
    liveWorker(plan.target, {
      schedules: { schedules: [{ cron: '*/5 * * * *' }] },
    }),
    liveWorker(plan.target, {
      settings: { bindings: bindingsFor(plan.previous) },
    }),
  ])
    await assert.rejects(captureAfter({ plan, ...credentials(live) }));
});

test('an already transitioned Worker is held to unchanged settings', async () => {
  const before = await captureBefore({
    plan,
    ...credentials(liveWorker(plan.target)),
  });
  assert.equal(before.stage, 'target');
  const same = await captureAfter({
    plan,
    ...credentials(liveWorker(plan.target)),
  });
  compareTransition(plan, before, same);
  const moved = await captureAfter({
    plan,
    ...credentials(
      liveWorker(plan.target, {
        settings: { compatibility_flags: [], placement: { mode: 'smart' } },
      })
    ),
  });
  assert.throws(
    () => compareTransition(plan, before, moved),
    /acceptance is blocked/
  );
  assert.throws(
    () => compareTransition(plan, { ...before, transition: 'other' }, same),
    /another settings transition/
  );
});

test('a live Worker matching neither stage fails closed without leaking values', async () => {
  const halfway = liveWorker(plan.previous, {
    schedules: { schedules: plan.target.crons.map((cron) => ({ cron })) },
  });
  await assert.rejects(
    captureBefore({ plan, ...credentials(halfway) }),
    (error) => {
      assert.match(error.message, /match no recorded transition stage/);
      assert.match(error.message, /previous: cron schedules differ/);
      assert.match(
        error.message,
        /target: Worker vars differ: CRON_CONTROL_ENABLED_JOBS, CRON_CONTROL_WORKER_PROCESSORS, INFRASTRUCTURE_ORIGIN, INVENTORY_ORIGIN, PAY_ORIGIN, TASKS_ORIGIN\)$/
      );
      assert.ok(!error.message.includes('tuturuuu.com'));
      return true;
    }
  );
});

for (const [label, binding, error] of [
  [
    'unreviewed binding type',
    { name: 'CACHE', type: 'kv_namespace', namespace_id: 'kv' },
    /unreviewed kv_namespace binding CACHE/,
  ],
  [
    'foreign Durable Object environment',
    {
      name: 'CRON_LEDGER',
      type: 'durable_object_namespace',
      class_name: 'CronLedger',
      environment: 'staging',
    },
    /unreviewed environment on durable_object_namespace binding CRON_LEDGER/,
  ],
  [
    'Durable Object dispatch namespace',
    {
      name: 'CRON_LEDGER',
      type: 'durable_object_namespace',
      class_name: 'CronLedger',
      script_name: 'tuturuuu-cron-control',
      dispatch_namespace: 'tenants',
    },
    /unreviewed dispatch_namespace on durable_object_namespace binding CRON_LEDGER/,
  ],
  [
    'unreviewed text binding attribute',
    {
      name: 'WEB_ORIGIN',
      type: 'plain_text',
      text: 'https://tuturuuu.com',
      environment: 'staging',
    },
    /unreviewed environment on plain_text binding WEB_ORIGIN/,
  ],
  [
    'cross-Worker Durable Object',
    {
      name: 'CRON_LEDGER',
      type: 'durable_object_namespace',
      class_name: 'CronLedger',
      script_name: 'another-worker',
    },
    /targets another Worker/,
  ],
])
  test(`${label} fails the target verification`, async () => {
    const target = liveWorker(plan.target, {
      settings: {
        bindings: [
          ...bindingsFor(plan.target).filter(
            (entry) => entry.name !== binding.name
          ),
          binding,
        ],
      },
    });
    await assert.rejects(captureAfter({ plan, ...credentials(target) }), error);
  });

test('server-provided binding identifiers never reach output', async () => {
  const echo = 'SERVER-CANARY %45%63%68%6F \\u0045\\u0063';
  const messages = [];
  for (const bindings of [
    [...bindingsFor(plan.target), { name: echo, type: echo }],
    [...bindingsFor(plan.target), { name: echo, type: 'plain_text', text: '' }],
    [
      ...bindingsFor(plan.target),
      { name: 'WEB_ORIGIN', type: 'plain_text', text: 'x', [echo]: echo },
    ],
    bindingsFor(plan.target).map((binding) =>
      binding.type === 'durable_object_namespace'
        ? { ...binding, class_name: echo }
        : binding
    ),
  ])
    await assert.rejects(
      captureAfter({
        plan,
        ...credentials(liveWorker(plan.target, { settings: { bindings } })),
      }),
      (error) => {
        messages.push(error.message);
        return true;
      }
    );
  assert.deepEqual(messages, [
    'unreviewed unrecognized binding unrecognized',
    'Worker vars differ: unrecognized',
    'unreviewed unrecognized on plain_text binding WEB_ORIGIN',
    'Durable Object bindings differ',
  ]);
});
