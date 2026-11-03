import { expect, test } from 'bun:test';
import {
  canonical,
  rebuildHoldRegistry,
  sha256,
  verifyChain,
} from '../../../packages/meet-core/src/features/meeting-ai/server/erase-ledger';
import { Ledger } from './ledger';

const ws = '11111111-1111-4111-8111-111111111111';
const op = '22222222-2222-4222-8222-222222222222';
const hold = {
  kind: 'hold_create',
  operation_key: op,
  ws_id: ws,
  meeting_id: null as string | null,
  body: {
    transition_id: '33333333-3333-4333-8333-333333333333',
    hold_id: op,
    scope: { ws_id: ws, meeting_id: null as string | null },
    kind: 'legal_hold',
    at: '2026-11-03T00:00:00.000Z',
    approval_ref: '44444444-4444-4444-8444-444444444444',
    review_by: '2026-12-03T00:00:00.000Z',
  },
};
async function fixture() {
  const local = new Map<string, unknown>();
  const remote = new Map<string, string>();
  let fail = false;
  const key = await crypto.subtle.importKey(
    'raw',
    new Uint8Array(32).fill(7),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
  const storage = {
    async get<T>(k: string) {
      return structuredClone(local.get(k)) as T | undefined;
    },
    async put(k: string, v: unknown) {
      local.set(k, structuredClone(v));
    },
  };
  const bucket = {
    async get(k: string) {
      return remote.get(k) ?? null;
    },
    async hasAfter(path: string) {
      return [...remote.keys()].some((k) => k > path);
    },
    async create(k: string, v: string) {
      if (fail) throw Error('offline');
      if (remote.has(k) && remote.get(k) !== v) throw Error('conflict');
      remote.set(k, v);
    },
  };
  const ledger = new Ledger(
    storage,
    bucket,
    () => key,
    1,
    ['99999999-9999-4999-8999-999999999999'],
    () => '2026-11-03T00:00:00.000Z'
  );
  return {
    ledger,
    local,
    remote,
    key,
    fail: () => {
      fail = true;
    },
    restart: () =>
      new Ledger(
        storage,
        bucket,
        () => key,
        1,
        ['99999999-9999-4999-8999-999999999999'],
        () => '2026-11-04T00:00:00.000Z'
      ),
    recover: () => {
      fail = false;
    },
  };
}
test('gapless chain and identical retry returns same receipt', async () => {
  const f = await fixture();
  const a = await f.ledger.append(hold);
  expect(await f.ledger.append(hold)).toEqual(a);
  expect(a.seq).toBe(1);
  expect(f.remote.size).toBe(1);
  expect(await verifyChain([a], () => f.key)).toEqual({ seq: 1, mac: a.mac });
});
test('conflicting duplicate is refused', async () => {
  const f = await fixture();
  await f.ledger.append(hold);
  await expect(
    f.ledger.append({
      ...hold,
      body: { ...hold.body, review_by: '2027-01-03T00:00:00.000Z' },
    })
  ).rejects.toThrow('LEDGER_CONFLICT');
});
test('R2 failure never acknowledges; restart retries pending bytes before next append', async () => {
  const f = await fixture();
  f.fail();
  await expect(f.ledger.append(hold)).rejects.toThrow();
  expect(f.remote.size).toBe(0);
  f.recover();
  const a = await f.restart().append(hold);
  expect(a.seq).toBe(1);
  expect(f.remote.size).toBe(1);
});
test('gap, edit and tail truncation fail verification', async () => {
  const f = await fixture();
  const a = await f.ledger.append(hold);
  await expect(verifyChain([{ ...a, seq: 2 }], () => f.key)).rejects.toThrow();
  await expect(
    verifyChain([{ ...a, at: '2027-01-01T00:00:00.000Z' }], () => f.key)
  ).rejects.toThrow();
  await expect(
    verifyChain([], () => f.key, { seq: 1, mac: a.mac })
  ).rejects.toThrow();
});
test('C3 registry uses independent events after snapshot; active holds never expire automatically', async () => {
  const f = await fixture();
  const a = await f.ledger.append(hold);
  expect(rebuildHoldRegistry([a]).size).toBe(1);
  const b = await f.ledger.append({
    ...hold,
    kind: 'hold_release',
    body: {
      ...hold.body,
      transition_id: '55555555-5555-4555-8555-555555555555',
    },
  });
  expect(b.seq).toBe(2);
  expect(rebuildHoldRegistry([a, b]).size).toBe(0);
  expect([...f.remote.keys()]).toEqual([
    'ledger/00000000000000000001.json',
    'ledger/00000000000000000002.json',
  ]);
});
test('EC and free text rejected before storage', async () => {
  const f = await fixture();
  await expect(
    f.ledger.append({ ...hold, ws_id: '99999999-9999-4999-8999-999999999999' })
  ).rejects.toThrow();
  await expect(
    f.ledger.append({
      ...hold,
      body: { ...hold.body, name: 'private content' },
    })
  ).rejects.toThrow();
  expect(f.local.size).toBe(0);
});
test('canonical JSON vector', () => {
  expect(canonical({ z: [2, 1], a: { z: null, a: 1 } })).toBe(
    '{"a":{"a":1,"z":null},"z":[2,1]}'
  );
});

test('unacknowledged hold transition prevents registry reads', async () => {
  const f = await fixture();
  f.fail();
  await expect(f.ledger.append(hold)).rejects.toThrow();
  await expect(f.ledger.read(0, 500)).rejects.toThrow('LEDGER_PENDING');
});
test('independent copy edit or loss fails closed on read and duplicate', async () => {
  const f = await fixture();
  await f.ledger.append(hold);
  f.remote.set('ledger/00000000000000000001.json', 'edited');
  await expect(f.ledger.read(0, 500)).rejects.toThrow();
  await expect(f.ledger.append(hold)).rejects.toThrow();
});
test('cancelled is terminal; refused may later commit', async () => {
  const f = await fixture();
  const base = {
    operation_key: op,
    ws_id: ws,
    meeting_id: ws,
    kind: 'outcome',
  };
  const committed = {
    ...base,
    body: {
      state: 'committed',
      generation_after: 1,
      doc_generation_target: null,
      history_cutoff_id: null,
      attested_state_hash: null,
    },
  };
  await f.ledger.append({
    ...base,
    body: { state: 'aborted', reason: 'refused' },
  });
  expect((await f.ledger.append(committed)).seq).toBe(2);
  const g = await fixture();
  await g.ledger.append({
    ...base,
    body: { state: 'aborted', reason: 'cancelled' },
  });
  await expect(g.ledger.append(committed)).rejects.toThrow('LEDGER_CANCELLED');
});

test('intent binds canonical plan hash and stores block MACs without raw block hashes', async () => {
  const f = await fixture();
  const plan = {
    v: 1,
    kind: 'meeting_erase',
    ws_id: ws,
    meeting_id: ws,
    operation_key: op,
    actor_role: 'host',
    subject: { kind: 'selection' },
    generation_target: 1,
    doc_generation_target: 1,
    transcript: null,
    document: {
      document_id: ws,
      decision: 'blocks',
      pre_state_hash: 'aa'.repeat(32),
      blocks: [{ index: 0, block_sha256: 'bb'.repeat(32) }],
    },
    playground: null,
    label_removal: null,
    recording: null,
    stores: ['S-DL'],
  };
  const input = {
    kind: 'intent',
    ws_id: ws,
    meeting_id: ws,
    operation_key: op,
    body: { plan, plan_hash: await sha256(canonical(plan)) },
  };
  const e = await f.ledger.append(input);
  expect(canonical(e)).not.toContain('block_sha256');
  expect(canonical(e)).not.toContain('bb'.repeat(32));
  expect(canonical(e)).toContain('block_mac');
  await expect(
    f.ledger.append({
      ...input,
      body: { ...input.body, plan_hash: 'cc'.repeat(32) },
    })
  ).rejects.toThrow('LEDGER_PLAN_MISMATCH');
});

test('private verifier rebuilds registry without exporting key material', async () => {
  const f = await fixture();
  await f.ledger.append(hold);
  const result = await f.ledger.verify();
  expect(result.head.seq).toBe(1);
  expect(result.holds).toHaveLength(1);
});

test('SQLite rollback cannot hide later R2 holds, including an empty local head', async () => {
  const f = await fixture();
  const snapshot = new Map(f.local);
  await f.ledger.append(hold);
  f.local.clear();
  for (const [k, v] of snapshot) f.local.set(k, v);
  await expect(f.restart().verify()).rejects.toThrow('LEDGER_HEAD_MISMATCH');
});
test('SQLite rollback to an earlier acknowledged head fails closed', async () => {
  const f = await fixture();
  await f.ledger.append(hold);
  const snapshot = new Map(f.local);
  await f.ledger.append({
    ...hold,
    operation_key: ws,
    body: { ...hold.body, hold_id: ws },
  });
  f.local.clear();
  for (const [k, v] of snapshot) f.local.set(k, v);
  await expect(f.restart().verify()).rejects.toThrow('LEDGER_HEAD_MISMATCH');
});
for (const attack of ['orphan', 'double', 'kind', 'scope']) {
  test(`invalid hold transition ${attack} is refused before reservation`, async () => {
    const f = await fixture();
    if (attack !== 'orphan') await f.ledger.append(hold);
    const before = structuredClone(f.local);
    const release = {
      ...hold,
      kind: attack === 'double' ? 'hold_create' : 'hold_release',
      body: {
        ...hold.body,
        transition_id: ws,
        ...(attack === 'kind' ? { kind: 'retention_lock' } : {}),
      },
    };
    if (attack === 'scope') {
      release.meeting_id = ws;
      release.body.scope = { ws_id: ws, meeting_id: ws };
    }
    await expect(f.ledger.append(release)).rejects.toThrow(
      'LEDGER_HOLD_CONFLICT'
    );
    expect(f.local).toEqual(before);
    expect((await f.ledger.verify()).head.seq).toBe(
      attack === 'orphan' ? 0 : 1
    );
  });
}
test('committed cannot later be cancelled', async () => {
  const f = await fixture();
  const base = {
    kind: 'outcome',
    operation_key: op,
    ws_id: ws,
    meeting_id: ws,
  };
  await f.ledger.append({
    ...base,
    body: {
      state: 'committed',
      generation_after: 1,
      doc_generation_target: null,
      history_cutoff_id: null,
      attested_state_hash: null,
    },
  });
  await expect(
    f.ledger.append({
      ...base,
      body: { state: 'aborted', reason: 'cancelled' },
    })
  ).rejects.toThrow('LEDGER_COMMITTED');
});
test('confirmed and reconciled receipts have independent retry identities', async () => {
  const f = await fixture();
  const receipt = {
    kind: 'receipt',
    operation_key: op,
    ws_id: ws,
    meeting_id: ws,
    body: {
      store: 'S-T',
      state: 'confirmed',
      installed_generation: 1,
      post_state_hash: null,
      post_pm_hash: null,
      verified_zero: true,
      rows_rewritten: 1,
      hwm: null,
    },
  };
  const first = await f.ledger.append(receipt);
  const reconciled = {
    ...receipt,
    body: { ...receipt.body, state: 'reconciled' },
  };
  const second = await f.ledger.append(reconciled);
  expect(second.seq).toBe(first.seq + 1);
  expect(await f.ledger.append(reconciled)).toEqual(second);
});
test('an unacknowledged append can commit when another caller appends', async () => {
  const f = await fixture();
  f.fail();
  await expect(f.ledger.append(hold)).rejects.toThrow('LEDGER_UNACKED');
  f.recover();
  await f.restart().append({
    ...hold,
    operation_key: ws,
    body: { ...hold.body, hold_id: ws },
  });
  expect((await f.ledger.verify()).holds).toHaveLength(2);
});
test('invalid input reports only a fixed error code', async () => {
  const f = await fixture();
  await expect(
    f.ledger.append({ ...hold, 'private@example.invalid': true })
  ).rejects.toThrow(/^LEDGER_INPUT_INVALID$/);
});

test('verification releases serialization between bounded pages and rejects a moving head', async () => {
  const f = await fixture();
  for (let n = 0; n < 21; n++) {
    const id = `22222222-2222-4222-8222-${String(n).padStart(12, '0')}`;
    await f.ledger.append({
      ...hold,
      operation_key: id,
      body: { ...hold.body, hold_id: id },
    });
  }
  let sections = 0;
  const verified = await f.ledger.verify(async (fn) => {
    sections++;
    return fn();
  });
  expect(verified.holds).toHaveLength(21);
  expect(sections).toBe(5);
  let calls = 0;
  await expect(
    f.ledger.verify(async (fn) => {
      if (++calls === 3) await f.ledger.append(hold);
      return fn();
    })
  ).rejects.toThrow('LEDGER_HEAD_MISMATCH');
});
