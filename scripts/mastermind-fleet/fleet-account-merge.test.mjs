import assert from 'node:assert/strict';
import test from 'node:test';
import {
  mergeFleetAccounts,
  normalizeScope,
  readingIsEligible,
  zonedTime,
} from './fleet-account-merge.mjs';

const NOW = new Date('2026-11-28T04:20:00.000Z');
const RESET = '2026-11-28T09:00:00.000Z';
const KEY_A = `acct-${'a'.repeat(32)}`;
const KEY_B = `acct-${'b'.repeat(32)}`;

const at = (offsetMs) => new Date(NOW.getTime() + offsetMs).toISOString();

const reading = (overrides = {}) => ({
  windowId: 'five_hour',
  kind: 'session',
  scope: {},
  usedPercent: 10,
  resetsAt: RESET,
  observedAt: at(-60_000),
  authoritative: true,
  ...overrides,
});

const row = (instanceId, readings = [reading()], overrides = {}) => ({
  accountKey: KEY_A,
  provider: 'claude',
  instanceId,
  activeLanes: 0,
  readings,
  ...overrides,
});

const host = (id, accounts, overrides = {}) => ({
  host: id,
  read: 'ok',
  lanes: 'counted',
  accounts,
  ...overrides,
});

const fleet = (hosts, overrides = {}) => ({
  v: 1,
  coverage: 'complete',
  hosts,
  ...overrides,
});

const merge = (hosts, overrides) =>
  mergeFleetAccounts(fleet(hosts, overrides), NOW).accounts;

/** Both input orders, so a choice cannot depend on which came first. */
const bothOrders = (hosts) => [hosts, [...hosts].reverse()];

test('takes remaining percent once, from the newest eligible reading', () => {
  const hosts = [
    host('m4', [
      row(
        'claude_3',
        [reading({ usedPercent: 40, observedAt: at(-200_000) })],
        {
          activeLanes: 2,
        }
      ),
    ]),
    host('i9', [
      row('claude_alias', [reading({ usedPercent: 5 })], { activeLanes: 1 }),
    ]),
    host('studio', [
      row(
        'claude_3',
        [reading({ usedPercent: 70, observedAt: at(-250_000) })],
        {
          activeLanes: 3,
        }
      ),
    ]),
  ];
  for (const order of bothOrders(hosts)) {
    const [account, ...rest] = merge(order);
    assert.equal(rest.length, 0);
    assert.equal(account.remainingPercent, 95);
    assert.equal(account.fresh, true);
    assert.equal(account.identity, 'provider');
    assert.equal(account.windows.length, 1);
    assert.deepEqual(account.windows[0].source, {
      host: 'i9',
      instanceId: 'claude_alias',
    });
    assert.equal(account.activeCount, 6);
    assert.deepEqual(account.lanesByHost, { i9: 1, m4: 2, studio: 3 });
    assert.deepEqual(account.hosts, ['i9', 'm4', 'studio']);
    assert.deepEqual(account.instances, [
      { host: 'i9', instanceId: 'claude_alias' },
      { host: 'm4', instanceId: 'claude_3' },
      { host: 'studio', instanceId: 'claude_3' },
    ]);
  }
});

const INELIGIBLE = {
  'not authoritative': { authoritative: false },
  'one millisecond in the future': { observedAt: at(1) },
  'one minute in the future': { observedAt: at(60_000) },
  'older than the maximum age': { observedAt: at(-300_001) },
  'observed without a timezone': { observedAt: '2026-11-28T04:19:30' },
  'observed on an impossible day': { observedAt: '2026-11-31T04:19:30Z' },
  'observed as a bare date': { observedAt: '2026-11-28' },
  'observed at no time': { observedAt: null },
  'missing usage': { usedPercent: null },
  'absent usage': { usedPercent: undefined },
  'usage that is not a number': { usedPercent: Number.NaN },
  'infinite usage': { usedPercent: Number.POSITIVE_INFINITY },
  'text usage': { usedPercent: '10' },
  'negative usage': { usedPercent: -1 },
  'usage above 100': { usedPercent: 100.5 },
  'a reset that is due now': { resetsAt: NOW.toISOString() },
  'a passed reset': { resetsAt: at(-1) },
  'a reset without a timezone': { resetsAt: '2026-11-28T09:00:00' },
  'an unreadable reset': { resetsAt: 'invalid' },
  'no reset on a used session window': { resetsAt: null, usedPercent: 1 },
  'no reset on an unused weekly window': {
    resetsAt: null,
    usedPercent: 0,
    kind: 'weekly',
  },
  'an epoch reset outside antigravity windows': {
    resetsAt: '1970-01-01T00:00:00Z',
    usedPercent: 0,
  },
  'an epoch reset on a used antigravity window': {
    resetsAt: '1970-01-01T00:00:00Z',
    usedPercent: 3,
    windowId: 'gemini-5h',
  },
};

for (const [name, overrides] of Object.entries(INELIGIBLE)) {
  test(`never lets a reading ${name} replace an eligible one`, () => {
    const bad = reading({ usedPercent: 99, ...overrides });
    assert.equal(readingIsEligible(bad, NOW), false);
    // The eligible reading is older than every dated bad one it competes with.
    const good = reading({
      windowId: bad.windowId,
      kind: bad.kind,
      usedPercent: 30,
      observedAt: at(-290_000),
    });
    for (const order of bothOrders([
      host('m4', [row('claude_3', [good])]),
      host('i9', [row('claude_3', [bad])]),
    ])) {
      const [account] = merge(order);
      assert.equal(account.remainingPercent, 70);
      assert.equal(account.windows.length, 1);
      assert.equal(account.windows[0].source.host, 'm4');
    }
    // Alone it withholds the percentage instead of reporting its own.
    const [alone] = merge([host('i9', [row('claude_3', [bad])])]);
    assert.equal(alone.remainingPercent, null);
    assert.equal(alone.fresh, false);
    assert.deepEqual(
      [
        alone.windows[0].remainingPercent,
        alone.windows[0].observedAt,
        alone.windows[0].resetsAt,
        alone.windows[0].source,
      ],
      [null, null, null, null]
    );
  });
}

const ELIGIBLE = {
  'observed now': { observedAt: NOW.toISOString() },
  'exactly at the maximum age': { observedAt: at(-300_000) },
  'with a numeric offset': { observedAt: '2026-11-28T11:19:30+07:00' },
  'with no usage yet': { usedPercent: 0 },
  'fully used': { usedPercent: 100 },
  'for an unstarted session window': { usedPercent: 0, resetsAt: null },
  'for an empty reset on an unstarted session': {
    usedPercent: 0,
    resetsAt: '',
  },
  'for an unstarted antigravity window': {
    windowId: '3p-weekly',
    kind: 'weekly',
    usedPercent: 0,
    resetsAt: '1970-01-01T00:00:00Z',
  },
};

for (const [name, overrides] of Object.entries(ELIGIBLE)) {
  test(`accepts a reading ${name}`, () => {
    const candidate = reading(overrides);
    assert.equal(readingIsEligible(candidate, NOW), true);
    const [account] = merge([host('m4', [row('claude_3', [candidate])])]);
    assert.equal(account.remainingPercent, 100 - candidate.usedPercent);
  });
}

test('a timestamp needs a real day and an explicit timezone', () => {
  assert.equal(zonedTime('2026-11-28T04:20:00Z'), NOW.getTime());
  assert.equal(zonedTime('2026-11-28T11:20:00+07:00'), NOW.getTime());
  for (const value of [
    '2026-11-28T04:20:00',
    '2026-11-28 04:20:00Z',
    '2026-02-30T04:20:00Z',
    '2026-13-01T04:20:00Z',
    'Sat, 28 Nov 2026 04:20:00 GMT',
    NOW.getTime(),
    undefined,
  ])
    assert.equal(zonedTime(value), null, String(value));
});

test('breaks ties on usage, reset, host and instance in that order', () => {
  const winner = (hosts) =>
    bothOrders(hosts).map((order) => merge(order)[0].windows[0].source);
  const same = (source) => [source, source];

  // Equal times: the higher usage, even on the host that sorts last.
  assert.deepEqual(
    winner([
      host('a', [row('one', [reading({ usedPercent: 20 })])]),
      host('z', [row('one', [reading({ usedPercent: 60 })])]),
    ]),
    same({ host: 'z', instanceId: 'one' })
  );
  // Equal usage too: the later reset.
  assert.deepEqual(
    winner([
      host('a', [row('one')]),
      host('z', [row('one', [reading({ resetsAt: at(36_000_000) })])]),
    ]),
    same({ host: 'z', instanceId: 'one' })
  );
  // Identical readings: the first host, then the first instance.
  assert.deepEqual(
    winner([host('z', [row('one')]), host('a', [row('one')])]),
    same({ host: 'a', instanceId: 'one' })
  );
  for (const rows of bothOrders([row('two'), row('one')]))
    assert.deepEqual(merge([host('a', rows)])[0].windows[0].source, {
      host: 'a',
      instanceId: 'one',
    });
  // Newer wins over higher usage: ties are the only place usage ranks.
  assert.deepEqual(
    winner([
      host('a', [row('one', [reading({ usedPercent: 5 })])]),
      host('z', [
        row('one', [reading({ usedPercent: 90, observedAt: at(-120_000) })]),
      ]),
    ]),
    same({ host: 'a', instanceId: 'one' })
  );
});

test('compares observation instants, not their spellings', () => {
  const newest = (first, second) =>
    merge([
      host('m4', [
        row('one', [reading({ usedPercent: 50, observedAt: first })]),
      ]),
      host('i9', [
        row('one', [reading({ usedPercent: 20, observedAt: second })]),
      ]),
    ])[0].remainingPercent;
  // 11:19:30+07:00 is 04:19:30Z, the later instant.
  assert.equal(newest('2026-11-28T11:19:30+07:00', '2026-11-28T04:19:00Z'), 50);
  // 11:18:30+07:00 sorts last as text but is the earlier instant.
  assert.equal(newest('2026-11-28T11:18:30+07:00', '2026-11-28T04:19:00Z'), 80);
});

test('keys a window on id, kind and normalized scope', () => {
  assert.deepEqual(
    normalizeScope({ providerIds: ['b', 'a', 'b'], modelIds: ['y', 'x'] }),
    { modelIds: ['x', 'y'], providerIds: ['a', 'b'] }
  );
  assert.deepEqual(normalizeScope(undefined), normalizeScope({ modelIds: [] }));

  const scoped = (scope, usedPercent, observedAt = at(-60_000)) =>
    reading({ scope, usedPercent, observedAt });
  const [same] = merge([
    host('m4', [
      row('one', [
        scoped({ modelIds: ['x', 'y'], providerIds: ['p'] }, 20, at(-90_000)),
      ]),
    ]),
    host('i9', [
      row('one', [
        scoped({ providerIds: ['p'], modelIds: ['y', 'x', 'y'] }, 40),
      ]),
    ]),
  ]);
  assert.equal(same.windows.length, 1);
  assert.equal(same.remainingPercent, 60);
  const [empty] = merge([
    host('m4', [row('one', [reading({ scope: undefined })])]),
    host('i9', [row('one', [scoped({ providerIds: [], modelIds: [] }, 10)])]),
  ]);
  assert.equal(empty.windows.length, 1);

  const [distinct] = merge([
    host('m4', [
      row('one', [
        reading(),
        scoped({ modelIds: ['x'] }, 80),
        scoped({ modelIds: ['x', 'y'] }, 30),
        scoped({ providerIds: ['x'] }, 40),
        reading({ windowId: 'seven_day', usedPercent: 50 }),
        reading({ kind: 'weekly', usedPercent: 60 }),
      ]),
    ]),
  ]);
  assert.equal(distinct.windows.length, 6);
  // The headline is the tightest eligible window, model-scoped ones included.
  assert.equal(distinct.remainingPercent, 20);
});

test('is fresh only when every window has an eligible reading', () => {
  const [account] = merge([
    host('m4', [
      row('one', [
        reading({ usedPercent: 25 }),
        reading({ windowId: 'seven_day', kind: 'weekly', resetsAt: at(-1) }),
      ]),
    ]),
  ]);
  assert.equal(account.remainingPercent, 75);
  assert.equal(account.fresh, false);
  const [none] = merge([host('m4', [row('one', [])])]);
  assert.equal(none.remainingPercent, null);
  assert.equal(none.fresh, false);
});

test('never merges equal keys or instance ids across providers or accounts', () => {
  const accounts = merge([
    host('m4', [row('shared', [reading({ usedPercent: 10 })])]),
    host('i9', [
      row('shared', [reading({ usedPercent: 20 })], { provider: 'codex' }),
    ]),
    host('studio', [
      row('shared', [reading({ usedPercent: 30 })], { accountKey: KEY_B }),
    ]),
  ]);
  assert.deepEqual(
    accounts.map((a) => [a.provider, a.accountKey, a.remainingPercent]),
    [
      ['claude', KEY_A, 90],
      ['claude', KEY_B, 70],
      ['codex', KEY_A, 80],
    ]
  );
});

test('labels an unidentified instance as unestablished', () => {
  const [account] = merge([
    host('m4', [
      row('one', [reading()], {
        accountKey: `unidentified-${'c'.repeat(32)}`,
      }),
    ]),
  ]);
  assert.equal(account.identity, 'unestablished');
});

test('adds alias lanes on one host and lanes across hosts', () => {
  const [account] = merge([
    host('m4', [
      row('one', [], { activeLanes: 2 }),
      row('two', [], { activeLanes: 5 }),
    ]),
    host('i9', [row('one', [], { activeLanes: 1 })]),
  ]);
  assert.deepEqual(account.lanesByHost, { i9: 1, m4: 7 });
  assert.equal(account.activeCount, 8);
});

test('a host that cannot count makes every total unknown', () => {
  const counted = host('m4', [
    row('one', [], { activeLanes: 2 }),
    row('other', [], { accountKey: KEY_B, activeLanes: 1 }),
  ]);
  const totals = (hosts, overrides) =>
    merge(hosts, overrides).map((account) => account.activeCount);

  assert.deepEqual(totals([counted]), [2, 1]);
  // A failed host lists no accounts, so it may run lanes on any of them.
  const failed = host('i9', [], { read: 'failed', lanes: 'unknown' });
  assert.deepEqual(totals([counted, failed]), ['unknown', 'unknown']);
  const uncounted = host('i9', [row('one', [], { activeLanes: 'unknown' })], {
    lanes: 'unknown',
  });
  const [shared, local] = merge([counted, uncounted]);
  assert.deepEqual(
    [shared.activeCount, local.activeCount],
    ['unknown', 'unknown']
  );
  // The per-host breakdown keeps what each host did count.
  assert.deepEqual(shared.lanesByHost, { i9: 'unknown', m4: 2 });
  assert.deepEqual(local.lanesByHost, { m4: 1 });
  assert.deepEqual(totals([host('i9', [], { lanes: 'unknown' }), counted]), [
    'unknown',
    'unknown',
  ]);
  assert.deepEqual(totals([counted], { coverage: 'partial' }), [
    'unknown',
    'unknown',
  ]);
});

test('reports an unsafe lane total as unknown', () => {
  const huge = (id) =>
    host(id, [row('one', [], { activeLanes: Number.MAX_SAFE_INTEGER })]);
  const [account] = merge([huge('m4'), huge('i9')]);
  assert.equal(account.activeCount, 'unknown');
});

const unidentified = `unidentified-${'d'.repeat(32)}`;
const INVALID = {
  'another version': fleet([], { v: 2 }),
  'an unknown coverage': fleet([], { coverage: 'full' }),
  'an extra top-level field': { ...fleet([]), token: 'x' },
  'hosts that are not a list': fleet({}),
  'too many hosts': fleet(
    Array.from({ length: 65 }, (_, i) => host(`h${i}`, []))
  ),
  'a repeated host': fleet([host('m4', []), host('m4', [])]),
  'an unsafe host id': fleet([host('__proto__', [])]),
  'an unknown read status': fleet([host('m4', [], { read: 'partial' })]),
  'an unknown lane status': fleet([host('m4', [], { lanes: 'zero' })]),
  'a missing read status': fleet([host('m4', [], { read: undefined })]),
  'a failed host that claims a lane count': fleet([
    host('m4', [], { read: 'failed' }),
  ]),
  'a failed host that lists accounts': fleet([
    host('m4', [row('one', [], { activeLanes: 'unknown' })], {
      read: 'failed',
      lanes: 'unknown',
    }),
  ]),
  'a repeated instance row': fleet([host('m4', [row('one'), row('one')])]),
  'a raw account identity as the key': fleet([
    host('m4', [row('one', [], { accountKey: 'person@example.com' })]),
  ]),
  'a reused unidentified key': fleet([
    host('m4', [row('one', [], { accountKey: unidentified })]),
    host('i9', [row('one', [], { accountKey: unidentified })]),
  ]),
  'a raw identity field on a row': fleet([
    host('m4', [row('one', [], { email: 'person@example.com' })]),
  ]),
  'an unsafe provider': fleet([
    host('m4', [row('one', [], { provider: 'a b' })]),
  ]),
  'an empty instance id': fleet([host('m4', [row('')])]),
  'negative lanes': fleet([host('m4', [row('one', [], { activeLanes: -1 })])]),
  'fractional lanes': fleet([
    host('m4', [row('one', [], { activeLanes: 1.5 })]),
  ]),
  'unsafe integer lanes': fleet([
    host('m4', [row('one', [], { activeLanes: 2 ** 53 })]),
  ]),
  'text lanes': fleet([host('m4', [row('one', [], { activeLanes: '1' })])]),
  'NaN lanes': fleet([
    host('m4', [row('one', [], { activeLanes: Number.NaN })]),
  ]),
  'missing lanes on a counted host': fleet([
    host('m4', [row('one', [], { activeLanes: undefined })]),
  ]),
  'unknown lanes on a counted host': fleet([
    host('m4', [row('one', [], { activeLanes: 'unknown' })]),
  ]),
  'a lane count on an uncounted host': fleet([
    host('m4', [row('one', [])], { lanes: 'unknown' }),
  ]),
  'an unknown window kind': fleet([
    host('m4', [row('one', [reading({ kind: 'daily' })])]),
  ]),
  'a reading without a window id': fleet([
    host('m4', [row('one', [reading({ windowId: '' })])]),
  ]),
  'a reading without an authority flag': fleet([
    host('m4', [row('one', [reading({ authoritative: 'yes' })])]),
  ]),
  'an unknown scope field': fleet([
    host('m4', [row('one', [reading({ scope: { kind: 'models' } })])]),
  ]),
  'scope ids that are not a list': fleet([
    host('m4', [row('one', [reading({ scope: { modelIds: 'x' } })])]),
  ]),
  'scope ids that are not text': fleet([
    host('m4', [row('one', [reading({ scope: { modelIds: [1] } })])]),
  ]),
  'too many readings': fleet([
    host('m4', [
      row(
        'one',
        Array.from({ length: 33 }, () => reading())
      ),
    ]),
  ]),
};

for (const [name, input] of Object.entries(INVALID)) {
  test(`rejects an input with ${name}`, () => {
    assert.throws(
      () => mergeFleetAccounts(input, NOW),
      /^Error: fleet_input_invalid$/
    );
  });
}

test('rejects inherited contract fields and accepts null-prototype records', () => {
  const input = fleet([]);
  assert.throws(
    () => mergeFleetAccounts(Object.create(input), NOW),
    /fleet_input_invalid/
  );
  assert.deepEqual(
    mergeFleetAccounts(Object.assign(Object.create(null), input), NOW).accounts,
    []
  );
});
