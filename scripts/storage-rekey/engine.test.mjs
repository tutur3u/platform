import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createEngine, newKeyFor } from './engine.mjs';
import { loadLedger, mergeSelection } from './ledger.mjs';
import { createStopFence } from './stop-fence.mjs';
import { OperationError } from './supabase.mjs';

// Fake world: a storage map keyed by name and a refs map (ref id -> key).
function world() {
  const objects = new Map();
  const refs = new Map();
  let seq = 0;
  const put = (name, extra = {}) =>
    objects.set(name, {
      id: `obj-${++seq}`,
      name,
      updated_at: 't0',
      size: '5',
      mimetype: 'text/plain',
      ...extra,
    });
  const nameFrom = (query) =>
    /name = '((?:[^']|'')*)'/.exec(query)?.[1].replaceAll("''", "'");
  const calls = [];
  const sql = {
    async read(query) {
      calls.push('sql.read');
      if (query.startsWith('PRECHECK ')) {
        const entry = JSON.parse(query.slice(9));
        const row = [...objects.values()].find((o) => o.id === entry.id);
        return [
          {
            present: Boolean(row),
            name: row?.name,
            updated_at: row?.updated_at,
            skip_reason: row?.skip ?? null,
          },
        ];
      }
      const row = objects.get(nameFrom(query));
      return row ? [row] : [];
    },
    async write(query) {
      calls.push('sql.write');
      const { from, to, guard, entry } = JSON.parse(query.slice(5));
      const old = objects.get(entry.oldName);
      const guardOk = !guard || (old && old.updated_at === entry.oldUpdatedAt);
      const newOk = objects.has(entry.newName);
      let updated = 0;
      if (guardOk && newOk) {
        for (const [id, key] of refs) {
          if (key !== from) continue;
          refs.set(id, to);
          updated += 1;
        }
      }
      return [{ guard_ok: guardOk, new_ok: newOk, chat_files: updated }];
    },
  };
  const storage = {
    failCopy: 0,
    async copy(from, to) {
      calls.push('storage.copy');
      if (this.failCopy > 0) {
        this.failCopy -= 1;
        throw new OperationError('copy_http_503', { retryable: true });
      }
      const source = objects.get(from);
      put(to, { size: source.size, mimetype: source.mimetype });
    },
    async remove(keys) {
      calls.push('storage.remove');
      for (const key of keys) objects.delete(key);
    },
    async sign(key) {
      return `signed:${key}`;
    },
    async headStatus(url) {
      return objects.has(url.slice(7)) ? 200 : 400;
    },
  };
  const roots = {
    chats: {
      precheckSql: ({ entry }) =>
        `PRECHECK ${JSON.stringify({ id: entry.id })}`,
      refsUpdateSql: (args) => `REFS ${JSON.stringify(args)}`,
    },
  };
  return { objects, refs, put, sql, storage, roots, calls };
}

function setup(
  t,
  { maxOps = 1000, names = ['ws/chats/c1/a.txt', 'ws/chats/c1/b.txt'] } = {}
) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rekey-engine-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const w = world();
  for (const name of names) {
    w.put(name);
    w.refs.set(`ref:${name}`, name);
  }
  const ledger = loadLedger(
    path.join(dir, 'l.json'),
    { projectRef: 'r', environment: 'staging', bucket: 'workspaces' },
    { now: 't' }
  );
  mergeSelection(
    ledger,
    [...w.objects.values()].map((o) => ({
      id: o.id,
      root: 'chats',
      wsId: 'ws',
      name: o.name,
      updatedAt: o.updated_at,
      size: o.size,
      mimetype: o.mimetype,
    })),
    { now: 't' }
  );
  const stopFile = path.join(dir, 'STOP');
  const make = (ops = maxOps) =>
    createEngine({
      ledger,
      save: () => {},
      sql: w.sql,
      storage: w.storage,
      fence: createStopFence({ stopFile, maxOps: ops }),
      roots: w.roots,
      log: () => {},
      retry: { attempts: 3, sleep: async () => {} },
    });
  return { w, ledger, stopFile, make };
}

test('new keys keep the directory and never reuse the old key', () => {
  const key = newKeyFor(
    'ws/chats/ai/resources/c/1712_a b.pdf',
    () => '11111111-2222-4333-8444-555555555555'
  );
  assert.equal(
    key,
    'ws/chats/ai/resources/c/11111111-2222-4333-8444-555555555555-1712_a b.pdf'
  );
  assert.throws(() => newKeyFor('ws/chats/c/a', () => ''), {
    code: 'key_uuid_invalid',
  });
  const keys = new Set(
    Array.from({ length: 200 }, () => newKeyFor('ws/chats/c/a.txt'))
  );
  assert.equal(keys.size, 200);
  assert.equal(keys.has('ws/chats/c/a.txt'), false);
  assert.throws(() => newKeyFor('noslash'), { code: 'key_shape' });
  assert.throws(() => newKeyFor(`ws/${'x'.repeat(1100)}`), {
    code: 'key_too_long',
  });
});

test('happy path re-keys every object, moves refs, deletes old keys', async (t) => {
  const { w, ledger, make } = setup(t);
  const result = await make().run({
    root: 'chats',
    batchSize: 50,
    probeEvery: 1,
  });
  assert.equal(result.stopped, null);
  assert.equal(result.counts.old_deleted, 2);
  for (const entry of Object.values(ledger.objects)) {
    assert.notEqual(entry.newName, entry.oldName);
    assert.equal(w.objects.has(entry.oldName), false);
    assert.equal(w.objects.has(entry.newName), true);
    assert.equal(w.refs.get(`ref:${entry.oldName}`), entry.newName);
    assert.deepEqual(entry.probe, { url: null, status: 400 });
    assert.deepEqual(
      entry.history.map((h) => h.state),
      ['selected', 'copied', 'verified', 'refs_updated', 'old_deleted']
    );
  }
});

test('old key is deleted only after the refs commit', async (t) => {
  const { w, make } = setup(t, { names: ['ws/chats/c1/a.txt'] });
  await make().run({ root: 'chats' });
  const removeAt = w.calls.indexOf('storage.remove');
  assert.ok(w.calls.indexOf('sql.write') < removeAt);
});

test('STOP mid-run halts before the next operation and a restart resumes', async (t) => {
  const { w, ledger, stopFile, make } = setup(t);
  const engine = make();
  const realCopy = w.storage.copy.bind(w.storage);
  w.storage.copy = async (from, to) => {
    await realCopy(from, to);
    fs.writeFileSync(stopFile, ''); // operator creates STOP right after the first copy
  };
  const first = await engine.run({ root: 'chats' });
  assert.equal(first.stopped, 'stop_file');
  const states = Object.values(ledger.objects)
    .map((e) => e.state)
    .sort();
  assert.deepEqual(states, ['selected', 'selected']);
  // The copy landed but was not recorded; the restart must adopt it, not copy twice.
  w.storage.copy = realCopy;
  fs.rmSync(stopFile);
  const copiesBefore = w.calls.filter((c) => c === 'storage.copy').length;
  const second = await make().run({ root: 'chats' });
  assert.equal(second.counts.old_deleted, 2);
  assert.equal(
    w.calls.filter((c) => c === 'storage.copy').length - copiesBefore,
    1
  );
  assert.equal(w.objects.size, 2);
});

test('max-ops cap stops cleanly and is resumable', async (t) => {
  const { make } = setup(t);
  const first = await make(5).run({ root: 'chats' });
  assert.equal(first.stopped, 'max_ops');
  assert.equal(first.opsUsed, 5);
  const second = await make().run({ root: 'chats' });
  assert.equal(second.counts.old_deleted, 2);
});

test('transient copy errors retry within the bound; persistent ones fail the object', async (t) => {
  const { w, ledger, make } = setup(t, {
    names: ['ws/chats/c1/a.txt', 'ws/chats/c1/b.txt'],
  });
  w.storage.failCopy = 2;
  let result = await make().run({ root: 'chats' });
  assert.equal(result.counts.old_deleted, 2);

  const again = setup(t, { names: ['ws/chats/c2/a.txt'] });
  again.w.storage.failCopy = 10;
  result = await again.make().run({ root: 'chats' });
  const [entry] = Object.values(again.ledger.objects);
  assert.equal(entry.state, 'failed');
  assert.equal(entry.errorCode, 'copy_http_503');
  assert.equal(again.w.calls.filter((c) => c === 'storage.copy').length, 3);
  assert.ok(ledger);
});

test('CAS: an object changed after selection is skipped and our copy removed', async (t) => {
  const { w, ledger, make } = setup(t, { names: ['ws/chats/c1/a.txt'] });
  const engine = make();
  const [entry] = Object.values(ledger.objects);
  await engine.advance(entry, {}); // runs to completion; reset and replay with a concurrent change
  assert.equal(entry.state, 'old_deleted');

  const fresh = setup(t, { names: ['ws/chats/c9/a.txt'] });
  const [e2] = Object.values(fresh.ledger.objects);
  const realCopy = fresh.w.storage.copy.bind(fresh.w.storage);
  fresh.w.storage.copy = async (from, to) => {
    await realCopy(from, to);
    fresh.w.objects.get(from).updated_at = 't1'; // user re-uploaded mid-batch
  };
  await fresh.make().run({ root: 'chats' });
  assert.equal(e2.state, 'skipped');
  assert.equal(e2.skipReason, 'changed_since_selection');
  assert.equal(fresh.w.objects.has(e2.oldName), true);
  assert.equal(fresh.w.objects.has(e2.newName), false);
  assert.equal(fresh.w.refs.get(`ref:${e2.oldName}`), e2.oldName);
  assert.ok(w);
});

test('deleted chats/owners are skipped before any copy', async (t) => {
  const { w, ledger, make } = setup(t, { names: ['ws/chats/c1/a.txt'] });
  [...w.objects.values()][0].skip = 'chat_deleted';
  await make().run({ root: 'chats' });
  const [entry] = Object.values(ledger.objects);
  assert.equal(entry.state, 'skipped');
  assert.equal(entry.skipReason, 'chat_deleted');
  assert.equal(w.calls.includes('storage.copy'), false);
});

test('rollback before old_deleted restores refs and removes the copy; old_deleted is refused', async (t) => {
  const { w, ledger, make } = setup(t);
  const [first, second] = Object.values(ledger.objects);
  await make().advance(first, {});
  assert.equal(first.state, 'old_deleted');
  // Drive the second object only to refs_updated with op budgets.
  await make(4).run({ root: 'chats' }); // precheck, read-new, copy, read-new -> copied
  await make(2).run({ root: 'chats' }); // verify read, refs write -> refs_updated
  assert.equal(second.state, 'refs_updated');
  assert.equal(w.refs.get(`ref:${second.oldName}`), second.newName);

  const result = await make().rollback({ root: 'chats' });
  assert.equal(second.state, 'rolled_back');
  assert.equal(w.refs.get(`ref:${second.oldName}`), second.oldName);
  assert.equal(w.objects.has(second.oldName), true);
  assert.equal(w.objects.has(second.newName), false);
  assert.equal(first.state, 'old_deleted');
  assert.equal(result.oldDeletedNotRolledBack, 1);
});
