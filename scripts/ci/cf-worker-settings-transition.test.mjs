import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  captureAfter,
  captureBefore,
  compareTransition,
  settingsPlan,
} from './cf-worker-settings.mjs';

const BASELINE = JSON.parse(
  readFileSync(
    new URL('./fixtures/cf-worker-parity/cron-control.json', import.meta.url),
    'utf8'
  )
);
const CRON_CONTROL = {
  identity: {
    ...BASELINE.identity,
    vars: { ...BASELINE.identity.vars, CRON_CONTROL_WEB_MODE: 'off' },
  },
  previousIdentity: BASELINE.identity,
  transition: {
    decision: 'CRON-WEB-MODE-1: regression fixture for additive disabled mode',
    fields: ['vars'],
  },
};
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

/** Target bindings with extra attributes on the declared WEB_ORIGIN var. */
function withWebOrigin(attributes) {
  return bindingsFor(plan.target).map((binding) =>
    binding.name === 'WEB_ORIGIN' ? { ...binding, ...attributes } : binding
  );
}

/** Fake read-only API whose live Worker matches `identity` (plus overrides). */
function liveWorker(identity, { settings = {}, ...overrides } = {}) {
  const responses = {
    service: {
      default_environment: { script: { last_deployed_from: 'cf' } },
    },
    settings: {
      compatibility_date: identity.compatibilityDate,
      compatibility_flags: identity.compatibilityFlags,
      usage_model: 'standard',
      observability: {
        enabled: true,
        head_sampling_rate: 0.05,
        ...(identity.observability.traces && {
          traces: { enabled: false, head_sampling_rate: 0.05, persist: true },
        }),
      },
      bindings: bindingsFor(identity),
      ...settings,
    },
    subdomain: { enabled: true, previews_enabled: true },
    schedules: { schedules: identity.crons.map((cron) => ({ cron })) },
    secrets: identity.secrets.map((name) => ({ name })),
    domains: [],
    zones: [],
    deployments: {
      deployments: [
        { id: 'live', versions: [{ version_id: 'v', percentage: 100 }] },
      ],
    },
    ...overrides,
  };
  const calls = [];
  return {
    calls,
    fetchImpl: async (url, init) => {
      assert.equal(init.method, 'GET');
      calls.push(url);
      const key = url.includes('/workers/services/')
        ? 'service'
        : url.includes('/zones?')
          ? 'zones'
          : url.split('/').at(-1);
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
  assert.match(plan.transition.decision, /^CRON-WEB-MODE-1:/);
  assert.deepEqual(plan.transition.fields, ['vars']);
  const { CRON_CONTROL_WEB_MODE: webMode, ...liveVars } = plan.target.vars;
  assert.equal(webMode, 'off');
  assert.deepEqual(plan.previous, { ...plan.target, vars: liveVars });
  assert.equal(plan.target.crons.length, 9);
  assert.deepEqual(plan.target.durableObjectClasses, { CronLedger: 'sqlite' });
  assert.equal(
    plan.target.vars.CRON_CONTROL_ENABLED_JOBS,
    'database-cron-history-retention'
  );
  assert.equal(
    plan.previous.vars.CRON_CONTROL_ENABLED_JOBS,
    'database-cron-history-retention'
  );
  assert.equal(plan.target.vars.CRON_CONTROL_WORKER_PROCESSORS, '');
  assert.equal(plan.previous.vars.CRON_CONTROL_WORKER_PROCESSORS, '');
});

test('the live Worker without CRON_CONTROL_WEB_MODE passes the before check', async () => {
  const snapshot = await captureBefore({
    plan,
    ...credentials(liveWorker(plan.previous)),
  });
  assert.equal(snapshot.stage, 'previous');
  assert.equal(snapshot.transition, plan.transition.decision);
  assert.ok(
    !bindingsFor(plan.previous).some(
      (binding) => binding.name === 'CRON_CONTROL_WEB_MODE'
    )
  );
});

for (const mode of ['active', 'shadow', '']) {
  test(`a live CRON_CONTROL_WEB_MODE of '${mode}' fails the before check`, async () => {
    const live = {
      ...plan.previous,
      vars: { ...plan.previous.vars, CRON_CONTROL_WEB_MODE: mode },
    };
    await assert.rejects(
      captureBefore({ plan, ...credentials(liveWorker(live)) }),
      /match no recorded transition stage/
    );
  });
}

for (const [label, vars] of [
  [
    'jobs enabled beyond retention',
    {
      CRON_CONTROL_ENABLED_JOBS:
        'database-cron-history-retention,meet-transcript-retention',
    },
  ],
  ['jobs disabled', { CRON_CONTROL_ENABLED_JOBS: '' }],
  ['Worker processors set', { CRON_CONTROL_WORKER_PROCESSORS: 'web' }],
]) {
  test(`live drift (${label}) without WEB_MODE still fails the before check`, async () => {
    const live = { ...plan.previous, vars: { ...plan.previous.vars, ...vars } };
    await assert.rejects(
      captureBefore({ plan, ...credentials(liveWorker(live)) }),
      /match no recorded transition stage/
    );
  });
}

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
  assert.equal(live.calls.length, 8, 'one bounded read for both stages');
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
    settings: {
      bindings: bindingsFor({
        ...plan.previous,
        vars: {
          ...plan.previous.vars,
          CRON_CONTROL_ENABLED_JOBS: 'unreviewed-job',
        },
      }),
    },
  });
  await assert.rejects(
    captureBefore({ plan, ...credentials(halfway) }),
    (error) => {
      assert.match(error.message, /match no recorded transition stage/);
      assert.match(
        error.message,
        /previous: Worker vars differ: CRON_CONTROL_ENABLED_JOBS/
      );
      assert.match(
        error.message,
        /target: Worker vars differ: CRON_CONTROL_ENABLED_JOBS, CRON_CONTROL_WEB_MODE\)$/
      );
      assert.ok(!error.message.includes('unreviewed-job'));
      // No var value may leak: compare parsed hostnames, not substrings.
      const origins = new Set(
        Object.values({ ...plan.previous.vars, ...plan.target.vars })
          .filter((value) => URL.canParse(value))
          .map((value) => new URL(value).hostname)
      );
      assert.ok(origins.size > 0);
      const urls = error.message.match(/https?:\/\/[^\s,;)]+/g) ?? [];
      for (const candidate of urls)
        assert.ok(!origins.has(new URL(candidate).hostname));
      assert.deepEqual(urls, []);
      return true;
    }
  );
});

for (const [label, binding, error] of [
  [
    'unreviewed binding type',
    { name: 'CACHE', type: 'kv_namespace', namespace_id: 'kv' },
    /unreviewed kv_namespace binding <undeclared binding #14>$/,
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
    withWebOrigin({ [echo]: echo }),
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
    'unreviewed <unknown type> binding <undeclared binding #14>',
    'undeclared plain_text binding <undeclared binding #14>',
    'unreviewed <unknown attribute> on plain_text binding WEB_ORIGIN',
    'Durable Object bindings differ',
  ]);
});

test('identifier-shaped credentials used as binding names are never printed', async () => {
  // Valid identifiers and base64url text: syntax alone must not admit them.
  const token = 'tok_Ab3dEf5hIj7lMn9pQr1tUv3xYz5bCd7fGh9j';
  const encoded = Buffer.from(token).toString('base64url');
  const outputs = [];
  for (const name of [token, encoded])
    for (const bindings of [
      [...bindingsFor(plan.target), { name, type: 'plain_text', text: '' }],
      [
        ...bindingsFor(plan.target),
        { name, type: 'kv_namespace', namespace_id: name },
      ],
      [
        ...bindingsFor(plan.target),
        { name, type: 'durable_object_namespace', class_name: 'CronLedger' },
      ],
      withWebOrigin({ [name]: true }),
    ])
      await assert.rejects(
        captureAfter({
          plan,
          ...credentials(liveWorker(plan.target, { settings: { bindings } })),
        }),
        (error) => {
          outputs.push(error.message);
          return true;
        }
      );
  const text = outputs.join('\n');
  for (const form of [token, encoded, token.slice(0, 8), encoded.slice(0, 8)])
    assert.ok(!text.includes(form), 'a credential-shaped name reached output');
  assert.equal(outputs.length, 8);
  assert.ok(
    outputs.every((message) =>
      /<undeclared binding #14>|<unknown attribute>/.test(message)
    )
  );
});

test('prototype-shaped binding names cannot bypass verification', async () => {
  const messages = [];
  for (const name of ['__proto__', 'constructor', 'prototype'])
    for (const extra of [
      { name, type: 'plain_text', text: 'https://evil.example' },
      { name, type: 'durable_object_namespace', class_name: 'CronLedger' },
    ]) {
      const bindings = [...bindingsFor(plan.target), extra];
      // Both the target check and the first-transition `before` must fail.
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
      await assert.rejects(
        captureBefore({
          plan,
          ...credentials(
            liveWorker(plan.previous, {
              settings: { bindings: [...bindingsFor(plan.previous), extra] },
            })
          ),
        }),
        /match no recorded transition stage/
      );
    }
  assert.deepEqual(messages, [
    'undeclared plain_text binding <undeclared binding #14>',
    'undeclared durable_object_namespace binding <undeclared binding #14>',
    'undeclared plain_text binding <undeclared binding #14>',
    'undeclared durable_object_namespace binding <undeclared binding #14>',
    'undeclared plain_text binding <undeclared binding #14>',
    'undeclared durable_object_namespace binding <undeclared binding #14>',
  ]);
});

const dashboardPlan = settingsPlan(BASELINE);
function dashboardWorker(change = () => {}) {
  const live = {
    settings: {
      bindings: bindingsFor(BASELINE.identity),
    },
    service: {
      default_environment: { script: { last_deployed_from: 'dash' } },
    },
    deployments: {
      deployments: [
        {
          id: 'live',
          versions: [
            {
              version_id: BASELINE.dashboardAdmission.versionId,
              percentage: 100,
            },
          ],
        },
      ],
    },
  };
  change(live);
  return liveWorker(BASELINE.identity, live);
}

test('same-version dashboard preflight passes with exact fixture settings', async () => {
  const before = await captureBefore({
    plan: dashboardPlan,
    ...credentials(dashboardWorker()),
  });
  assert.deepEqual(before.schedules, [...BASELINE.identity.crons].sort());
  assert.equal(
    BASELINE.identity.vars.CRON_CONTROL_ENABLED_JOBS,
    'database-cron-history-retention'
  );
  assert.ok(!Object.hasOwn(BASELINE.identity.vars, 'CRON_CONTROL_WEB_MODE'));
  assert.deepEqual(BASELINE.identity.observability.traces, {
    enabled: false,
    headSamplingRate: 0.05,
    persist: true,
  });
  const after = await captureAfter({
    plan: dashboardPlan,
    ...credentials(liveWorker(BASELINE.identity)),
  });
  compareTransition(dashboardPlan, before, after);
});

test('dashboard cron comparison ignores order on both sides', async () => {
  const unordered = structuredClone(dashboardPlan);
  unordered.target.crons.reverse();
  const api = dashboardWorker((live) => {
    live.schedules = {
      schedules: BASELINE.identity.crons.map((cron) => ({ cron })).reverse(),
    };
  });
  await captureBefore({ plan: unordered, ...credentials(api) });
});

for (const [label, change] of [
  [
    'var',
    (live) => {
      live.settings.bindings.find(({ name }) => name === 'WEB_ORIGIN').text =
        'changed';
    },
  ],
  [
    'cron',
    (live) => {
      live.schedules = { schedules: [{ cron: '1 * * * *' }] };
    },
  ],
  [
    'binding type',
    (live) => {
      live.settings.bindings.at(-1).type = 'kv_namespace';
    },
  ],
  [
    'binding name',
    (live) => {
      live.settings.bindings.at(-1).name = 'OTHER';
    },
  ],
  [
    'binding class',
    (live) => {
      live.settings.bindings.at(-1).class_name = 'Other';
    },
  ],
  [
    'version',
    (live) => {
      live.deployments.deployments[0].versions[0].version_id = 'different';
    },
  ],
  [
    'traffic split',
    (live) => {
      live.deployments.deployments[0].versions = [
        { version_id: BASELINE.dashboardAdmission.versionId, percentage: 50 },
        { version_id: 'other', percentage: 50 },
      ];
    },
  ],
  [
    'extra secret',
    (live) => {
      live.secrets = [...BASELINE.identity.secrets, 'EXTRA'].map((name) => ({
        name,
      }));
    },
  ],
  [
    'missing secret binding',
    (live) => {
      live.settings.bindings = live.settings.bindings.filter(
        ({ name }) => name !== 'SUPABASE_URL'
      );
    },
  ],
  [
    'extra secret binding',
    (live) => {
      live.settings.bindings.push({ name: 'EXTRA', type: 'secret_text' });
    },
  ],
  [
    'compatibility date',
    (live) => {
      live.settings.compatibility_date = '2026-01-01';
    },
  ],
  [
    'trace sampling',
    (live) => {
      live.settings.observability = {
        enabled: true,
        head_sampling_rate: 0.05,
        traces: { enabled: false, head_sampling_rate: 1, persist: true },
      };
    },
  ],
]) {
  test(`dashboard admission rejects ${label} drift`, async () => {
    await assert.rejects(
      captureBefore({
        plan: dashboardPlan,
        ...credentials(dashboardWorker(change)),
      })
    );
  });
}

test('unrecorded dashboard deployments fail even with matching settings', async () => {
  await assert.rejects(
    captureBefore({
      plan: { target: BASELINE.identity },
      ...credentials(dashboardWorker()),
    }),
    /no reviewed admission/
  );
});
