import { expect, test } from 'bun:test';
import { Ledger } from '../../../../../../apps/meet-erase-ledger/src/ledger';
import { type Append, canonical, sha256 } from './erase-ledger';
import { reconcileMeetErasure } from './erase-reconcile';

const ws = '11111111-1111-4111-8111-111111111111';
const meeting = '22222222-2222-4222-8222-222222222222';
const op = '33333333-3333-4333-8333-333333333333';
const ec = '99999999-9999-4999-8999-999999999999';
async function fixture() {
  const local = new Map<string, unknown>();
  const mirror = new Map<string, string>();
  const key = await crypto.subtle.importKey(
    'raw',
    new Uint8Array(32).fill(7),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
  const ledger = new Ledger(
    {
      async get<T>(k: string) {
        return structuredClone(local.get(k)) as T | undefined;
      },
      async put(k: string, v: unknown) {
        local.set(k, structuredClone(v));
      },
    },
    {
      async get(k: string) {
        return mirror.get(k) ?? null;
      },
      async create(k: string, v: string) {
        mirror.set(k, v);
      },
      async hasAfter(k: string) {
        return [...mirror.keys()].some((p) => p > k);
      },
    },
    () => key,
    1,
    [ec],
    () => '2026-11-03T00:00:00.000Z'
  );
  const plan = {
    v: 1,
    kind: 'meeting_erase',
    ws_id: ws,
    meeting_id: meeting,
    operation_key: op,
    actor_role: 'host',
    subject: null,
    generation_target: 1,
    doc_generation_target: null,
    transcript: null,
    document: null,
    playground: null,
    label_removal: null,
    recording: null,
    stores: ['S-T', 'S-L'],
  } satisfies Extract<Append, { kind: 'intent' }>['body']['plan'];
  await ledger.append({
    kind: 'intent',
    ws_id: ws,
    meeting_id: meeting,
    operation_key: op,
    body: { plan, plan_hash: await sha256(canonical(plan)) },
  });
  const calls: string[] = [];
  let residual = 0;
  const port = {
    async assertQuarantine() {
      calls.push('quarantine');
    },
    async installHolds() {
      calls.push('holds');
    },
    async restoredOutcome() {
      return 'missing' as const;
    },
    async replay() {
      calls.push('replay');
    },
    async verify() {
      return { residual, coldLoadsReady: true };
    },
    async recordReconciled() {
      calls.push('receipt');
    },
    async release() {
      calls.push('release');
    },
    async hold(_entry: unknown, reason: string) {
      calls.push(reason);
    },
  };
  return {
    ledger,
    mirror,
    calls,
    port,
    plan,
    setResidual: (n: number) => {
      residual = n;
    },
  };
}
test('RT-O: intent without outcome is replayed before receipt and release', async () => {
  const f = await fixture();
  await reconcileMeetErasure({
    ledger: f.ledger,
    port: f.port,
    protectedWorkspaceIds: [ec],
  });
  expect(f.calls).toEqual([
    'quarantine',
    'holds',
    'replay',
    'receipt',
    'release',
  ]);
});
test('AT-10: mirror edit prevents every replay and release', async () => {
  const f = await fixture();
  f.mirror.clear();
  await expect(
    reconcileMeetErasure({
      ledger: f.ledger,
      port: f.port,
      protectedWorkspaceIds: [ec],
    })
  ).rejects.toThrow();
  expect(f.calls).toEqual(['quarantine']);
});
test('residual content keeps the meeting quarantined', async () => {
  const f = await fixture();
  f.setResidual(1);
  await reconcileMeetErasure({
    ledger: f.ledger,
    port: f.port,
    protectedWorkspaceIds: [ec],
  });
  expect(f.calls).toContain('residual');
  expect(f.calls).not.toContain('release');
});
test('terminal cancellation is never replayed', async () => {
  const f = await fixture();
  await f.ledger.append({
    kind: 'outcome',
    ws_id: ws,
    meeting_id: meeting,
    operation_key: op,
    body: { state: 'aborted', reason: 'cancelled' },
  });
  await reconcileMeetErasure({
    ledger: f.ledger,
    port: f.port,
    protectedWorkspaceIds: [ec],
  });
  expect(f.calls).not.toContain('replay');
  expect(f.calls).toContain('release');
});
test('C3: hold created after snapshot prevents no-outcome replay and escalates', async () => {
  const f = await fixture();
  const id = '44444444-4444-4444-8444-444444444444';
  await f.ledger.append({
    kind: 'hold_create',
    ws_id: ws,
    meeting_id: null,
    operation_key: id,
    body: {
      hold_id: id,
      transition_id: id,
      scope: { ws_id: ws, meeting_id: null },
      kind: 'legal_hold',
      at: '2026-11-03T00:00:00.000Z',
      approval_ref: op,
      review_by: '2026-12-03T00:00:00.000Z',
    },
  });
  await reconcileMeetErasure({
    ledger: f.ledger,
    port: f.port,
    protectedWorkspaceIds: [ec],
  });
  expect(f.calls).toContain('legal_hold_cora');
  expect(f.calls).not.toContain('replay');
  expect(f.calls).not.toContain('release');
});
test('ledger head changing before batch prevents replay', async () => {
  const f = await fixture();
  const install = f.port.installHolds;
  f.port.installHolds = async () => {
    await install();
    await f.ledger.append({
      kind: 'outcome',
      ws_id: ws,
      meeting_id: meeting,
      operation_key: op,
      body: { state: 'aborted', reason: 'refused' },
    });
  };
  await expect(
    reconcileMeetErasure({
      ledger: f.ledger,
      port: f.port,
      protectedWorkspaceIds: [ec],
    })
  ).rejects.toThrow('RESTORE_LEDGER_CHANGED');
  expect(f.calls).not.toContain('replay');
});
test('committed supersedes earlier refused; missing adapter stays held', async () => {
  const f = await fixture();
  await f.ledger.append({
    kind: 'outcome',
    ws_id: ws,
    meeting_id: meeting,
    operation_key: op,
    body: { state: 'aborted', reason: 'refused' },
  });
  await f.ledger.append({
    kind: 'outcome',
    ws_id: ws,
    meeting_id: meeting,
    operation_key: op,
    body: {
      state: 'committed',
      generation_after: 1,
      doc_generation_target: null,
      history_cutoff_id: null,
      attested_state_hash: null,
    },
  });
  f.port.replay = async () => {
    throw Error('unavailable');
  };
  await reconcileMeetErasure({
    ledger: f.ledger,
    port: f.port,
    protectedWorkspaceIds: [ec],
  });
  expect(f.calls).toContain('adapter_failed');
  expect(f.calls).not.toContain('release');
});
test('cold-load refusal prevents release even with zero residual', async () => {
  const f = await fixture();
  f.port.verify = async () => ({ residual: 0, coldLoadsReady: false });
  await reconcileMeetErasure({
    ledger: f.ledger,
    port: f.port,
    protectedWorkspaceIds: [ec],
  });
  expect(f.calls).toContain('residual');
  expect(f.calls).not.toContain('release');
});
test('EC configuration is required before ledger or protected reads', async () => {
  const f = await fixture();
  await expect(
    reconcileMeetErasure({
      ledger: f.ledger,
      port: f.port,
      protectedWorkspaceIds: [],
    })
  ).rejects.toThrow('RESTORE_EC_CONFIG_REQUIRED');
  expect(f.calls).toEqual(['quarantine']);
});
test('C3: audited release after snapshot removes the independent hold', async () => {
  const f = await fixture();
  const id = '44444444-4444-4444-8444-444444444444';
  const hold = {
    hold_id: id,
    transition_id: id,
    scope: { ws_id: ws, meeting_id: meeting },
    kind: 'legal_hold',
    at: '2026-11-03T00:00:00.000Z',
    approval_ref: op,
    review_by: '2026-12-03T00:00:00.000Z',
  } as const;
  await f.ledger.append({
    kind: 'hold_create',
    ws_id: ws,
    meeting_id: meeting,
    operation_key: id,
    body: hold,
  });
  await f.ledger.append({
    kind: 'hold_release',
    ws_id: ws,
    meeting_id: meeting,
    operation_key: id,
    body: { ...hold, transition_id: op },
  });
  await reconcileMeetErasure({
    ledger: f.ledger,
    port: f.port,
    protectedWorkspaceIds: [ec],
  });
  expect(f.calls).toContain('replay');
  expect(f.calls).toContain('release');
});
test('unmatched outcome prevents global release', async () => {
  const f = await fixture();
  await f.ledger.append({
    kind: 'outcome',
    ws_id: ws,
    meeting_id: meeting,
    operation_key: '55555555-5555-4555-8555-555555555555',
    body: { state: 'aborted', reason: 'cancelled' },
  });
  await expect(
    reconcileMeetErasure({
      ledger: f.ledger,
      port: f.port,
      protectedWorkspaceIds: [ec],
    })
  ).rejects.toThrow('RESTORE_PROTOCOL');
  expect(f.calls).not.toContain('release');
});
