import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import {
  buildFleetAccountInput,
  fleetAccountsView,
  fleetLaneSources,
  fleetProvider,
  peerLanes,
  projectFleetRows,
  providerAccountKey,
  readLocalLanes,
} from './fleet-account-input.mjs';
import { mergeFleetAccounts } from './fleet-account-merge.mjs';

const NOW = new Date('2026-11-28T04:20:00.000Z');
const EMAIL = 'fixture.person@example.com';
const WORKSPACE = 'fixture-workspace-1';
const FINGERPRINT = 'ab'.repeat(32);

const limits = (usedPercent = 10, extra = {}) => ({
  checkedAt: '2026-11-28T04:19:00.000Z',
  windows: [
    {
      id: 'five_hour',
      kind: 'session',
      usedPercent,
      resetsAt: '2026-11-28T09:00:00.000Z',
    },
  ],
  ...extra,
});

const provider = (instanceId, overrides = {}) => ({
  instanceId,
  driver: 'claudeAgent',
  enabled: true,
  installed: true,
  auth: { status: 'authenticated', email: EMAIL, workspaceId: WORKSPACE },
  usageLimits: limits(),
  ...overrides,
});

const keyOf = (row, name = 'claude') => providerAccountKey(name, row);
const auth = (fields) => ({
  auth: { status: 'authenticated', email: EMAIL, ...fields },
});

test('maps drivers as agent-quota does', () => {
  assert.equal(fleetProvider('claudeAgent', 'claude_1'), 'claude');
  assert.equal(fleetProvider('codex', 'codex_1'), 'codex');
  assert.equal(
    fleetProvider('acpRegistry', 'acpRegistry_github_copilot'),
    'copilot'
  );
  assert.equal(fleetProvider('acpRegistry_github_copilot', 'x'), 'copilot');
  assert.equal(fleetProvider('acpRegistry', 'other'), 'acpRegistry');
  assert.equal(fleetProvider('a b', 'x'), null);
  assert.equal(fleetProvider(undefined, 'x'), null);
});

test('derives one opaque key per provider login and workspace', () => {
  const key = keyOf(provider('claude_1'));
  assert.match(key, /^acct-[a-f0-9]{32}$/);
  assert.equal(keyOf(provider('another_alias')), key);
  assert.equal(
    keyOf(auth({ email: ` ${EMAIL.toUpperCase()} `, workspaceId: WORKSPACE })),
    key
  );
  assert.notEqual(keyOf(auth({ workspaceId: 'fixture-workspace-2' })), key);
  assert.notEqual(
    keyOf(auth({ email: 'other@example.com', workspaceId: WORKSPACE })),
    key
  );
  assert.notEqual(keyOf(provider('claude_1'), 'codex'), key);
});

test('requires a workspace where one login holds several accounts', () => {
  for (const name of ['claude', 'codex', 'Claude', 'CODEX'])
    assert.equal(providerAccountKey(name, auth({})), null);
  for (const name of ['cursor', 'grok'])
    assert.match(providerAccountKey(name, auth({})), /^acct-/);
});

test('falls back to the credential fingerprint, never to a path or id', () => {
  const printed = {
    ...auth({}),
    usageLimits: limits(10, { credentialFingerprint: FINGERPRINT }),
  };
  const key = keyOf(printed);
  assert.match(key, /^acct-[a-f0-9]{32}$/);
  assert.ok(!key.includes(FINGERPRINT.slice(0, 32)));
  assert.equal(
    keyOf({
      ...printed,
      usageLimits: limits(10, {
        credentialFingerprint: FINGERPRINT.toUpperCase(),
      }),
    }),
    key
  );
  // The provider login wins, so a host with both still matches by login.
  assert.equal(
    keyOf(
      provider('x', {
        usageLimits: limits(10, { credentialFingerprint: FINGERPRINT }),
      })
    ),
    keyOf(provider('x'))
  );
  for (const row of [
    { auth: { status: 'authenticated' }, config: { homePath: '/home/x' } },
    { auth: { status: 'unauthenticated', email: EMAIL, workspaceId: 'w' } },
    { ...auth({}), usageLimits: { credentialFingerprint: 'short' } },
    {},
  ])
    assert.equal(keyOf(row), null);
});

test('projects every alias row and no raw account identity', () => {
  const rows = projectFleetRows({
    providers: [
      provider('claude_1', {
        usageLimits: limits(90, {
          checkedAt: '2026-11-27T12:00:00.000Z',
          credentialFingerprint: FINGERPRINT,
        }),
      }),
      provider('claude_hehe'),
      { driver: 'codex' },
    ],
  });
  assert.deepEqual(
    rows.map((row) => row.instanceId),
    ['claude_1', 'claude_hehe']
  );
  assert.equal(rows[0].accountKey, rows[1].accountKey);
  assert.equal(rows[0].readings[0].usedPercent, 90);
  assert.equal(rows[1].readings[0].usedPercent, 10);
  const text = JSON.stringify(rows);
  for (const secret of [EMAIL, WORKSPACE, FINGERPRINT])
    assert.ok(!text.includes(secret), secret);
});

test('keeps each window with its scope and leaves bad values to the merge', () => {
  const [row] = projectFleetRows({
    providers: [
      provider('codex_1', {
        driver: 'codex',
        usageLimits: {
          checkedAt: '2026-11-28T04:19:00.000Z',
          windows: [
            { kind: 'weekly', usedPercent: '5', resetsAt: 0 },
            {
              id: 'scoped',
              kind: 'daily',
              usedPercent: 3,
              modelIds: ['m2', 'm1'],
              providerIds: [],
            },
          ],
        },
      }),
    ],
  });
  assert.deepEqual(row.readings, [
    {
      windowId: 'weekly',
      kind: 'weekly',
      scope: {},
      usedPercent: null,
      // Not a missing reset, which could pass as an unstarted window.
      resetsAt: 'invalid',
      observedAt: '2026-11-28T04:19:00.000Z',
      authoritative: true,
    },
    {
      windowId: 'scoped',
      kind: 'unknown',
      scope: { modelIds: ['m2', 'm1'] },
      usedPercent: 3,
      resetsAt: null,
      observedAt: '2026-11-28T04:19:00.000Z',
      authoritative: false,
    },
  ]);
});

test('takes no reading from a row that cannot report current usage', () => {
  const many = Array.from({ length: 33 }, (_, i) => ({
    id: `w${i}`,
    kind: 'weekly',
    usedPercent: 1,
  }));
  for (const overrides of [
    { enabled: false },
    { installed: false },
    { auth: { status: 'unauthenticated' } },
    { usageLimits: undefined },
    { usageLimits: limits(1, { unavailable: { reason: 'unsupported' } }) },
    { usageLimits: { checkedAt: NOW.toISOString(), windows: {} } },
    { usageLimits: { checkedAt: NOW.toISOString(), windows: many } },
  ])
    assert.deepEqual(
      projectFleetRows({ providers: [provider('one', overrides)] })[0].readings,
      [],
      JSON.stringify(overrides).slice(0, 80)
    );
});

test('refuses a reply it cannot read row by row', () => {
  assert.equal(projectFleetRows(null), null);
  assert.equal(projectFleetRows({ providers: {} }), null);
  assert.equal(
    projectFleetRows({ providers: [provider('one'), provider('one')] }),
    null
  );
  const many = Array.from({ length: 65 }, (_, i) => provider(`p${i}`));
  assert.equal(projectFleetRows({ providers: many }), null);
});

function runsDatabase(rows, { instanceColumn = true } = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE orchestration_v2_projection_runs (
    thread_id TEXT, status TEXT, payload_json TEXT
    ${instanceColumn ? ', provider_instance_id TEXT' : ''})`);
  const insert = db.prepare(
    `INSERT INTO orchestration_v2_projection_runs VALUES (?, ?, ?${instanceColumn ? ', ?' : ''})`
  );
  for (const row of rows)
    insert.run(...(instanceColumn ? row : row.slice(0, 3)));
  return db;
}

test('counts local lanes once per thread and instance', () => {
  const held = JSON.stringify({ queueHeld: true });
  const lanes = readLocalLanes(
    runsDatabase([
      ['t1', 'running', '{}', 'a'],
      ['t1', 'queued', '{}', 'a'],
      ['t2', 'waiting', '{}', 'a'],
      ['t3', 'preparing', '{}', 'b'],
      ['t4', 'starting', '{}', 'b'],
      ['t5', 'queued', held, 'b'],
      ['t6', 'running', held, 'c'],
      ['t7', 'completed', '{}', 'c'],
      ['t8', 'failed', '{}', 'c'],
    ])
  );
  assert.deepEqual(
    lanes.map((lane) => `${lane.threadId}:${lane.instanceId}`).sort(),
    ['t1:a', 't2:a', 't3:b', 't4:b', 't6:c']
  );
  assert.deepEqual(readLocalLanes(runsDatabase([])), []);
});

test('cannot count local lanes it cannot attribute', () => {
  assert.equal(
    readLocalLanes(runsDatabase([['t1', 'running', '{}', null]])),
    null
  );
  assert.equal(
    readLocalLanes(runsDatabase([], { instanceColumn: false })),
    null
  );
  assert.equal(
    readLocalLanes(runsDatabase([['t1', 'queued', 'not json', 'a']])),
    null
  );
});

const peer = (threads, overrides = {}) => ({
  environment_id: 'env-i9',
  live: true,
  laneCoverage: 'complete',
  extraCounts: {},
  threads,
  ...overrides,
});
const thread = (threadId, state = 'running', instanceId = 'one') => ({
  threadId,
  state,
  provider: instanceId,
});

test('counts linked lanes only from a live complete listing', () => {
  assert.deepEqual(
    peerLanes(
      peer([
        thread('a'),
        thread('b', 'waiting'),
        thread('c', 'queued'),
        thread('d', 'idle'),
        thread('e', 'failed'),
      ])
    ).map((lane) => lane.threadId),
    ['a', 'b', 'c']
  );
  assert.deepEqual(peerLanes(peer([])), []);
  for (const overrides of [
    { live: false },
    { live: undefined },
    { laneCoverage: 'partial' },
    { laneCoverage: 'unavailable' },
    { extraCounts: { running: 1 } },
    { threads: undefined },
  ])
    assert.equal(peerLanes(peer([thread('a')], overrides)), null);
  assert.equal(
    peerLanes(peer([thread('a', 'running', undefined), { state: 'running' }])),
    null
  );
});

const rows = (instanceId = 'one') =>
  projectFleetRows({ providers: [provider(instanceId)] });
const machine = (id, extra = {}) => ({
  id,
  environmentId: `env-${id}`,
  rows: rows(),
  ...extra,
});
const sources = (local, peers = [peer([])]) =>
  fleetLaneSources({
    localId: 'm4',
    localLanes: local,
    peers,
    ids: new Map([
      ['env-i9', 'i9'],
      ['env-studio', 'studio'],
    ]),
  });
const lane = (threadId, instanceId = 'one') => ({ threadId, instanceId });

const statuses = (machines, laneSources, complete = true) =>
  buildFleetAccountInput({ machines, complete, laneSources }).hosts.map(
    (host) => [host.host, host.read, host.lanes]
  );

test('attributes each host lane to its own instance row', () => {
  const input = buildFleetAccountInput({
    machines: [
      machine('m4', {
        rows: projectFleetRows({
          providers: [provider('one'), provider('two')],
        }),
      }),
      machine('i9'),
    ],
    complete: true,
    laneSources: sources(
      [lane('a'), lane('a'), lane('b', 'two'), lane('c', 'two')],
      [peer([thread('d')])]
    ),
  });
  assert.deepEqual(
    input.hosts.map((host) =>
      host.accounts.map((a) => [a.instanceId, a.activeLanes])
    ),
    [
      [
        ['one', 1],
        ['two', 2],
      ],
      [['one', 1]],
    ]
  );
  assert.equal(input.coverage, 'complete');
  assert.equal(mergeFleetAccounts(input, NOW).accounts[0].activeCount, 4);
});

test('marks lanes unknown when a host cannot be counted truthfully', () => {
  const both = [machine('m4'), machine('i9')];
  const counted = [
    ['m4', 'ok', 'counted'],
    ['i9', 'ok', 'counted'],
  ];
  const only = (id) =>
    counted.map(([host, read, lanes]) => [
      host,
      read,
      host === id ? 'unknown' : lanes,
    ]);
  assert.deepEqual(statuses(both, sources([])), counted);
  assert.deepEqual(statuses(both, sources(null)), only('m4'));
  assert.deepEqual(statuses(both, sources([], [])), only('i9'));
  // A lane on an instance the account read does not list.
  assert.deepEqual(statuses(both, sources([lane('a', 'gone')])), only('m4'));
  // One thread active on two hosts could be counted twice.
  assert.deepEqual(
    statuses(both, sources([lane('a')], [peer([thread('a')])])),
    [
      ['m4', 'ok', 'unknown'],
      ['i9', 'ok', 'unknown'],
    ]
  );
  // Quota read from another environment than the lanes.
  assert.deepEqual(
    statuses(
      [machine('m4'), machine('i9', { environmentId: 'env-elsewhere' })],
      sources([])
    ),
    only('i9')
  );
  // The publishing host's reader points at a linked environment.
  assert.deepEqual(
    statuses(
      [machine('m4', { environmentId: 'env-i9' }), machine('studio')],
      sources([], [peer([]), peer([], { environment_id: 'env-studio' })])
    ),
    [
      ['m4', 'ok', 'unknown'],
      ['studio', 'ok', 'counted'],
    ]
  );
  // One environment read twice would add its lanes twice.
  assert.deepEqual(
    statuses(
      [machine('m4', { environmentId: 'env-i9' }), machine('i9')],
      sources([])
    ),
    [
      ['m4', 'ok', 'unknown'],
      ['i9', 'ok', 'unknown'],
    ]
  );
  assert.deepEqual(statuses([machine('m4', { rows: null })], sources([])), [
    ['m4', 'failed', 'unknown'],
  ]);
  assert.equal(
    buildFleetAccountInput({
      machines: both,
      complete: false,
      laneSources: sources([]),
    }).coverage,
    'partial'
  );
});

test('keeps unidentified instances apart across hosts and aliases', () => {
  const anonymous = () =>
    projectFleetRows({
      providers: ['one', 'two'].map((id) =>
        provider(id, { auth: { status: 'authenticated' } })
      ),
    });
  const merged = mergeFleetAccounts(
    buildFleetAccountInput({
      machines: [
        machine('m4', { rows: anonymous() }),
        machine('i9', { rows: anonymous() }),
      ],
      complete: true,
      laneSources: sources([]),
    }),
    NOW
  );
  assert.equal(merged.accounts.length, 4);
  assert.ok(merged.accounts.every((a) => a.identity === 'unestablished'));
});

test('a host with no account rows still makes totals unknown', () => {
  const merged = mergeFleetAccounts(
    buildFleetAccountInput({
      machines: [machine('m4'), machine('i9', { rows: null })],
      complete: true,
      laneSources: sources([lane('a')]),
    }),
    NOW
  );
  assert.equal(merged.accounts[0].activeCount, 'unknown');
  assert.deepEqual(merged.accounts[0].lanesByHost, { m4: 1 });
});

test('names why there is no view without echoing the error', () => {
  const failing = (message) => ({
    mergeAccounts() {
      throw new Error(message);
    },
  });
  const unavailable = (reason) => ({
    v: 1,
    generatedAt: NOW.toISOString(),
    status: 'unavailable',
    reason,
  });
  assert.deepEqual(
    fleetAccountsView(null, new Map(), NOW),
    unavailable('usage_unavailable')
  );
  assert.deepEqual(
    fleetAccountsView(failing('fleet_input_invalid'), new Map(), NOW),
    unavailable('fleet_input_invalid')
  );
  assert.deepEqual(
    fleetAccountsView(failing(`private ${EMAIL}`), new Map(), NOW),
    unavailable('fleet_merge_failed')
  );
  assert.deepEqual(
    fleetAccountsView(
      { mergeAccounts: (lanes, at) => ({ v: 1, lanes: lanes.size, at }) },
      new Map([['m4', {}]]),
      NOW
    ),
    { status: 'ok', v: 1, lanes: 1, at: NOW }
  );
});

test('requires a bounded email address before deriving a login account', () => {
  for (const email of [
    'a@localhost',
    'a @example.com',
    'a@@example.com',
    `${'a'.repeat(255)}@example.com`,
  ]) {
    assert.equal(keyOf(auth({ email, workspaceId: WORKSPACE })), null);
  }
});

test('a malformed window disqualifies its whole row without hiding other accounts', () => {
  for (const badWindow of [
    null,
    [],
    { modelIds: 'm1' },
    { providerIds: [1] },
    ...['modelIds', 'providerIds'].map((key) => ({
      [key]: Array.from({ length: 129 }, (_, i) => `id-${i}`),
    })),
  ]) {
    const valid = limits();
    const rows = projectFleetRows({
      providers: [
        provider('bad', {
          usageLimits: { ...valid, windows: [...valid.windows, badWindow] },
        }),
        provider(
          'healthy',
          auth({ email: 'other@example.com', workspaceId: WORKSPACE })
        ),
      ],
    });
    const input = buildFleetAccountInput({
      machines: [{ id: 'm4', environmentId: 'local', rows }],
      complete: true,
      laneSources: new Map(),
    });
    const { accounts } = mergeFleetAccounts(input, NOW);
    assert.equal(accounts.length, 2);
    assert.equal(
      accounts.find((account) => !account.fresh)?.remainingPercent,
      null
    );
    assert.equal(
      accounts.find((account) => account.fresh)?.remainingPercent,
      90
    );
  }
});

test('local lane reads fail on missing, empty or nontext thread ids', () => {
  for (const id of [null, '', 1, ['thread']]) {
    const db = {
      prepare: () => ({
        all: () => [{ thread_id: id, provider_instance_id: 'a' }],
      }),
    };
    assert.equal(readLocalLanes(db), null);
  }
});
