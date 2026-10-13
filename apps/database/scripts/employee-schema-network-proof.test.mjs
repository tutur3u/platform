import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  collectEmployeeNetworkProof,
  createEmployeeNetworkDiagnostics,
  createNetworkEventProof,
  employeeNetworkPredicateFields,
  employeeNetworkReasonCodes,
  emptyEmployeeNetworkDiagnostics,
  finalizeEmployeeNetworkDiagnostics,
  networkCoverageProof,
  parseEmployeeNetworkDiagnostics,
  retainedEmployeeNetworkImageDiagnostics,
  safeEvent,
} from './employee-schema-network-proof.mjs';
import {
  emptyEmployeeRelayEvidence,
  emptyEmployeeStartEvidence,
  finishEmployeeControllerWorkers,
} from './employee-schema-typegen.mjs';

const project = 'tt-source-aaaaaaaa-0123456789',
  network = 'a'.repeat(64),
  container = 'b'.repeat(64);
const ready = { id: 'c'.repeat(64), name: 'owned-ready' },
  end = { id: 'd'.repeat(64), name: 'owned-end' };
const event = (Type, Action, id, Attributes = {}) => ({
  Type,
  Action,
  Actor: { ID: id, Attributes },
});
const own = (image = 'ghcr.io/supabase/postgres-meta:v1') => ({
  image,
  'com.supabase.cli.project': project,
});
const trace = (image) => [
  event('network', 'create', ready.id, { name: ready.name }),
  event('container', 'create', container, own(image)),
  event('network', 'connect', network, { container }),
  event('container', 'start', container, own(image)),
  event('container', 'destroy', container, own(image)),
  event('network', 'create', end.id, { name: end.name }),
];
const coverage = (rows) =>
  networkCoverageProof(rows, rows, ready, end, project, network);
const codes = (value) => value.reasons.map((row) => row.code);

test('public pure exports preserve the original qualified result shape', () => {
  const proof = createNetworkEventProof(project, network);
  for (const row of trace().slice(1, -1)) proof.accept(JSON.stringify(row));
  assert.deepEqual(proof.result(), {
    qualified: true,
    networkId: network,
    containerIds: [container],
    images: ['ghcr.io/supabase/postgres-meta:v1'],
  });
  assert.equal(proof.healthy(), true);
  assert.equal(coverage(trace()).qualified, true);
  assert.equal(
    coverage(trace('ghcr.io/supabase/postgres:17')).qualified,
    false
  );
});
test('complete valid trace adds known passes while stream/trailing/drain stay unobserved', () => {
  const diagnostic = coverage(trace()).diagnostics;
  for (const key of employeeNetworkPredicateFields.slice(0, 6))
    assert.equal(diagnostic.predicates[key], 'PASS');
  for (const key of employeeNetworkPredicateFields.slice(6))
    assert.equal(diagnostic.predicates[key], 'UNKNOWN');
  assert.deepEqual(diagnostic.reasons, []);
});
test('known missing pgmeta denies the old conjunction and records a sufficient reason', () => {
  const result = coverage(trace('ghcr.io/supabase/postgres:17'));
  assert.equal(result.qualified, false);
  assert.equal(result.diagnostics.predicates.hasRequiredPgmetaCreate, 'FAIL');
  assert.ok(codes(result.diagnostics).includes('pgmeta-create-missing'));
  assert.equal(result.diagnostics.predicates.allOwnedCreatesStarted, 'PASS');
});
test('retained four-image evidence cannot invent the other eight predicate outcomes', () => {
  const diagnostic = retainedEmployeeNetworkImageDiagnostics(
    [
      'ghcr.io/supabase/gotrue:v2.196.0',
      'ghcr.io/supabase/postgres:17.6.1.167',
      'ghcr.io/supabase/realtime:v2.130.0',
      'ghcr.io/supabase/storage-api:v1.72.1',
    ],
    true
  );
  assert.equal(diagnostic.predicates.hasRequiredPgmetaCreate, 'FAIL');
  for (const key of employeeNetworkPredicateFields.filter(
    (key) => key !== 'hasRequiredPgmetaCreate'
  ))
    assert.equal(diagnostic.predicates[key], 'UNKNOWN');
  assert.deepEqual(
    retainedEmployeeNetworkImageDiagnostics(undefined, false),
    emptyEmployeeNetworkDiagnostics()
  );
});
for (const mode of [
  'duplicate',
  'extra-attach',
  'start-before-attach',
  'unknown-destroy',
  'unstarted',
  'undestroyed',
  'image',
  'id',
])
  test(`legacy denied lifecycle remains denied with causal vector: ${mode}`, () => {
    const rows = trace();
    if (mode === 'duplicate') rows.splice(2, 0, rows[1]);
    if (mode === 'extra-attach')
      rows.splice(
        3,
        0,
        event('network', 'connect', 'e'.repeat(64), { container })
      );
    if (mode === 'start-before-attach') [rows[2], rows[3]] = [rows[3], rows[2]];
    if (mode === 'unknown-destroy')
      rows.splice(4, 0, event('container', 'destroy', 'f'.repeat(64), own()));
    if (mode === 'unstarted') rows.splice(3, 1);
    if (mode === 'undestroyed') rows.splice(4, 1);
    if (mode === 'image') rows[1].Actor.Attributes.image = 'not-approved';
    if (mode === 'id') {
      for (const row of rows.filter((r) => r.Type === 'container'))
        row.Actor.ID = 'invalid-owned-id';
    }
    const result = coverage(rows);
    assert.equal(result.qualified, false);
    assert.ok(result.diagnostics.reasons.length >= 1);
    assert.ok(
      result.diagnostics.reasons.every(
        (row) =>
          row.witnessOrdinal === null || Number.isInteger(row.witnessOrdinal)
      )
    );
  });
test('malformed live JSON is known invalid and does not fabricate absent create/pgmeta outcomes', () => {
  const proof = createNetworkEventProof(project, network);
  proof.accept('{');
  assert.equal(proof.result().qualified, false);
  const diagnostic = proof.diagnostics();
  assert.equal(diagnostic.predicates.eventValidationAccepted, 'FAIL');
  assert.equal(diagnostic.predicates.hasOwnedCreate, 'UNKNOWN');
  assert.equal(diagnostic.predicates.hasRequiredPgmetaCreate, 'UNKNOWN');
  assert.ok(codes(diagnostic).includes('event-json-malformed'));
});
for (const mode of ['anchors', 'mismatch'])
  test(`coverage ${mode} denies with other predicates unknown`, () => {
    const rows = trace(),
      live = structuredClone(rows);
    if (mode === 'anchors') live.pop();
    else live[1].Actor.Attributes.image = 'ghcr.io/supabase/postgres:v1';
    const result = networkCoverageProof(
      live,
      rows,
      ready,
      end,
      project,
      network
    );
    assert.equal(result.qualified, false);
    assert.equal(result.diagnostics.predicates.windowsAnchoredAndEqual, 'FAIL');
    assert.equal(
      result.diagnostics.predicates.hasRequiredPgmetaCreate,
      'UNKNOWN'
    );
  });
test('simultaneous independent failure reasons remain bounded, counted, and deduplicated', () => {
  const accumulator = createEmployeeNetworkDiagnostics();
  for (let i = 1; i <= 10020; i++) accumulator.record('stream-error', i);
  accumulator.record('history-read-denied');
  const diagnostic = finalizeEmployeeNetworkDiagnostics(
    coverage(trace('ghcr.io/supabase/postgres:v1')).diagnostics,
    accumulator.result(),
    {
      observerStreamAccepted: 'FAIL',
      trailingLineEmpty: 'FAIL',
      observerDrained: 'FAIL',
    }
  );
  assert.equal(
    diagnostic.reasons.find((row) => row.code === 'stream-error').count,
    10000
  );
  assert.equal(
    diagnostic.reasons.find((row) => row.code === 'stream-error')
      .witnessOrdinal,
    1
  );
  for (const code of [
    'stream-error',
    'history-read-denied',
    'pgmeta-create-missing',
    'trailing-line-present',
    'drain-unconfirmed',
  ])
    assert.ok(codes(diagnostic).includes(code));
  assert.ok(diagnostic.reasons.length <= employeeNetworkReasonCodes.length);
  assert.ok(Buffer.byteLength(JSON.stringify(diagnostic)) < 8192);
});
for (const mode of [
  'extra',
  'state',
  'missing-predicate',
  'duplicate',
  'count',
  'witness',
  'raw',
])
  test(`strict diagnostic collector denies malformed ${mode}`, () => {
    const diagnostic = emptyEmployeeNetworkDiagnostics();
    if (mode === 'extra') diagnostic.qualified = true;
    if (mode === 'state') diagnostic.predicates.observerDrained = true;
    if (mode === 'missing-predicate')
      delete diagnostic.predicates.observerDrained;
    if (mode === 'duplicate')
      diagnostic.reasons = [
        { code: 'stream-error', count: 1, witnessOrdinal: 1 },
        { code: 'stream-error', count: 1, witnessOrdinal: 2 },
      ];
    if (mode === 'count')
      diagnostic.reasons = [
        { code: 'stream-error', count: 10001, witnessOrdinal: null },
      ];
    if (mode === 'witness')
      diagnostic.reasons = [
        { code: 'stream-error', count: 1, witnessOrdinal: network },
      ];
    if (mode === 'raw')
      diagnostic.reasons = [{ code: 'secret', count: 1, witnessOrdinal: null }];
    assert.throws(() => parseEmployeeNetworkDiagnostics(diagnostic));
    assert.throws(() =>
      collectEmployeeNetworkProof({
        qualified: true,
        observerDrained: true,
        diagnostics: diagnostic,
      })
    );
  });
test('a passing vector never upgrades a false qualified boolean or a failed drain', () => {
  const diagnostic = finalizeEmployeeNetworkDiagnostics(
    coverage(trace()).diagnostics,
    emptyEmployeeNetworkDiagnostics(),
    {
      observerStreamAccepted: 'PASS',
      trailingLineEmpty: 'PASS',
      observerDrained: 'PASS',
    }
  );
  const result = collectEmployeeNetworkProof({
    qualified: false,
    observerDrained: false,
    diagnostics: diagnostic,
  });
  assert.equal(result.qualified, false);
  assert.equal(result.observerDrained, false);
  assert.deepEqual(
    collectEmployeeNetworkProof({ qualified: false, observerDrained: true })
      .diagnostics,
    emptyEmployeeNetworkDiagnostics()
  );
});
test('diagnostics retain no raw labels, foreign IDs, names, secrets, or image strings', () => {
  const rows = trace();
  rows[1].Actor.Attributes.token = 'private-secret';
  rows[1].Actor.Attributes.name = 'private-name';
  rows.splice(
    3,
    0,
    event('network', 'connect', 'e'.repeat(64), {
      container,
      token: 'private-secret',
    })
  );
  const safe = rows.map((row) => safeEvent(JSON.stringify(row)));
  const text = JSON.stringify(coverage(safe).diagnostics);
  for (const privateValue of [
    'private-secret',
    'private-name',
    project,
    container,
    'e'.repeat(64),
    'ghcr.io',
    'Attributes',
    'token',
  ])
    assert.equal(text.includes(privateValue), false);
});
test('partial drain and malformed vectors do not prevent later independent finalizers', async () => {
  for (const malformed of [false, true]) {
    let relayCalls = 0,
      startupCalls = 0;
    const diagnostic = emptyEmployeeNetworkDiagnostics();
    if (malformed) diagnostic.predicates.observerDrained = 'invalid';
    const result = await finishEmployeeControllerWorkers({
      network: {
        finish: async () => ({
          qualified: false,
          observerDrained: false,
          diagnostics: diagnostic,
        }),
      },
      relay: {
        finish: async () => {
          relayCalls++;
          return { ...emptyEmployeeRelayEvidence(), drained: true };
        },
      },
      startup: {
        finish: async () => {
          startupCalls++;
          return { ...emptyEmployeeStartEvidence(), observerDrained: true };
        },
      },
    });
    assert.equal(result.networkProof.qualified, false);
    assert.equal(result.networkProof.observerDrained, false);
    assert.equal(relayCalls, 1);
    assert.equal(startupCalls, 1);
    assert.ok(
      result.failures.includes(
        malformed ? 'network-finish-denied' : 'network-drain-unconfirmed'
      )
    );
  }
});
test('the original 700-line network tests and relay/start/shutdown guards stay byte-identical', () => {
  for (const [file, expected] of [
    [
      'employee-schema-network.test.mjs',
      '7a4977b220355dc0f4f124699e6ed6c5d0f0a92834930637c8b14338015ffa58',
    ],
    [
      'employee-schema-loopback-relay.mjs',
      'cf7fd8f672290c6135991c86921bfe03f617386658b86fc9f96497b733cd5cc2',
    ],
    [
      'employee-schema-start-evidence.mjs',
      '6636af90dea4092f8e7a5a28537242f95c6cd7f7e962d8e142e12da74c41d29f',
    ],
    [
      'employee-schema-observer-shutdown.test.mjs',
      'f23caf2ea5df9cb5e17b189e48526c273117a2d1c1b51ce06af8118daf5416cc',
    ],
  ]) {
    assert.equal(
      createHash('sha256')
        .update(readFileSync(new URL(file, import.meta.url)))
        .digest('hex'),
      expected
    );
  }
});

// The production observer and collector run with a disposable Node event pipe.
// Docker replies are bounded fixtures; no daemon, SQL or host inspection is used.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startEmployeeNetworkObserver } from './employee-schema-network.mjs';

function observerFixture(t, mode) {
  const directory = mkdtempSync(
    path.join(os.tmpdir(), 'employee-network-reasons-')
  );
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const context = {
    source: 'a'.repeat(40),
    control: 'b'.repeat(40),
    run: '123',
    attempt: '1',
    project,
    name: 'tt-employee-net-123-1',
    marker: path.join(directory, 'owned.json'),
    receiptDirectory: directory,
  };
  const history = [],
    networks = new Map();
  let child,
    next = 1,
    historyCalls = 0;
  const emit = (row) => {
    const line = JSON.stringify(row);
    history.push(line);
    child.stdin.write(`${line}\n`);
  };
  const runner = async (_command, args) => {
    if (args[0] === 'events') {
      historyCalls++;
      if (mode === 'history-error') throw new Error('private history secret');
      return Buffer.from(`${history.join('\n')}\n`);
    }
    if (args[1] === 'ls') return Buffer.from('');
    if (args[1] === 'create') {
      const id = String(next++).repeat(64),
        name = args.at(-1);
      const labels = Object.fromEntries(
        args.flatMap((value, index) =>
          value === '--label' ? [args[index + 1].split('=')] : []
        )
      );
      networks.set(id, {
        Id: id,
        Name: name,
        Internal: true,
        Driver: 'bridge',
        Labels: labels,
        Containers: {},
      });
      emit(event('network', 'create', id, { name }));
      if (name.includes('-end-') && mode === 'trailing')
        child.stdin.write('partial-private-secret');
      return Buffer.from(id);
    }
    if (args[1] === 'rm') {
      networks.delete(args[2]);
      return Buffer.from(args[2]);
    }
    return Buffer.from(JSON.stringify([networks.get(args[2])]));
  };
  const observer = startEmployeeNetworkObserver(project, network, {
    context,
    runner,
    spawnEvents: () => {
      child = spawn(
        process.execPath,
        [
          '-e',
          'process.stdin.on("data",chunk=>process.stdout.write(chunk));setInterval(()=>{},1000)',
        ],
        { detached: true, stdio: ['pipe', 'pipe', 'pipe'] }
      );
      return child;
    },
  });
  return { observer, emit, historyCalls: () => historyCalls };
}
const observerTestOptions = { timeout: 10000 };
for (const mode of [
  'pass',
  'missing-pgmeta',
  'trailing',
  'history-error',
  'stream-error',
])
  test(
    `actual observer preserves qualification and records bounded reasons: ${mode}`,
    observerTestOptions,
    async (t) => {
      const fixture = observerFixture(t, mode);
      let result;
      try {
        await fixture.observer.ready();
        for (const row of trace(
          mode === 'missing-pgmeta' ? 'ghcr.io/supabase/postgres:v1' : undefined
        ).slice(1, -1))
          fixture.emit(row);
        if (mode === 'stream-error') fixture.emit(null);
      } finally {
        result = await fixture.observer.finish();
      }
      assert.equal(result.qualified, mode === 'pass');
      assert.equal(result.observerDrained, true);
      assert.equal(result.diagnostics.predicates.observerDrained, 'PASS');
      assert.ok(fixture.historyCalls() <= 1);
      const expected = {
        'missing-pgmeta': 'pgmeta-create-missing',
        trailing: 'trailing-line-present',
        'history-error': 'history-read-denied',
        'stream-error': 'stream-event-malformed',
      }[mode];
      if (expected) assert.ok(codes(result.diagnostics).includes(expected));
      const collected = collectEmployeeNetworkProof(result);
      assert.equal(collected.qualified, result.qualified);
      assert.equal(
        JSON.stringify(collected.diagnostics).includes('private-secret'),
        false
      );
    }
  );
