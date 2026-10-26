// Per-object re-key state machine:
//   selected -> copied -> verified -> refs_updated -> old_deleted
// with `skipped`, `failed` and `rolled_back` exits. Every side effect goes
// through `op()`, which checks the durable stop fence and the op budget first.
// Logs carry object ids, states and counts only, never object names.

import { randomUUID } from 'node:crypto';
import {
  countByState,
  pendingForRoot,
  rowsForRoot,
  transition,
} from './ledger.mjs';
import { StopRequested } from './stop-fence.mjs';
import { lit, OperationError, withRetry } from './supabase.mjs';

export const MAX_BATCH_SIZE = 50;
const MAX_KEY_BYTES = 1024;
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function newKeyFor(oldName, uuid = randomUUID) {
  const slash = oldName.lastIndexOf('/');
  if (slash <= 0 || slash === oldName.length - 1) {
    throw new OperationError('key_shape');
  }
  const id = uuid();
  if (!UUID_V4.test(id)) throw new OperationError('key_uuid_invalid');
  const next = `${oldName.slice(0, slash)}/${id}-${oldName.slice(slash + 1)}`;
  // Re-creating an object at its old key would revive every leaked token.
  if (next === oldName) throw new OperationError('key_reused');
  if (Buffer.byteLength(next) > MAX_KEY_BYTES) {
    throw new OperationError('key_too_long');
  }
  return next;
}

function objectRowSql(bucket, { id, name }) {
  const where = id ? `id = ${lit(id)}` : `name = ${lit(name)}`;
  return `select id, name, updated_at, owner, owner_id,
      metadata->>'size' as size, metadata->>'mimetype' as mimetype
    from storage.objects where bucket_id = ${lit(bucket)} and ${where}`;
}

export function createEngine({
  ledger,
  save,
  sql,
  storage,
  fence,
  roots,
  log,
  now,
  retry = {},
}) {
  const bucket = ledger.bucket;
  const at = () => now?.() ?? new Date().toISOString();
  const op = (fn) =>
    withRetry(async () => {
      fence.beforeOperation();
      return fn();
    }, retry);
  const move = (entry, to, patch) => {
    transition(entry, to, { now: at(), patch });
    save();
    log('object', {
      id: entry.id,
      state: to,
      reason: patch?.skipReason ?? patch?.errorCode,
    });
  };
  const readObject = async (key) =>
    (await op(() => sql.read(objectRowSql(bucket, key))))[0] ?? null;

  async function precheck(entry) {
    const root = roots[entry.root];
    const rows = await op(() => sql.read(root.precheckSql({ bucket, entry })));
    const row = rows[0];
    if (!row?.present) return 'gone';
    if (row.name !== entry.oldName || row.updated_at !== entry.oldUpdatedAt) {
      return 'changed_since_selection';
    }
    return row.skip_reason ?? null;
  }

  async function copyStep(entry) {
    const reason = await precheck(entry);
    if (reason) return move(entry, 'skipped', { skipReason: reason });
    if (!entry.newName) {
      entry.newName = newKeyFor(entry.oldName);
      save();
    }
    let created = await readObject({ name: entry.newName });
    if (!created) {
      try {
        await op(() => storage.copy(entry.oldName, entry.newName));
      } catch (error) {
        if (error instanceof StopRequested) throw error;
        // A copy that landed before a dropped response is still a copy.
        created = await readObject({ name: entry.newName });
        if (!created) throw error;
      }
      created ??= await readObject({ name: entry.newName });
    }
    if (!created) throw new OperationError('copy_not_visible');
    move(entry, 'copied', { newId: created.id });
  }

  async function verifyStep(entry) {
    const created = await readObject({ name: entry.newName });
    const sameSize = created && String(created.size) === String(entry.size);
    const sameType =
      created && (created.mimetype ?? null) === (entry.mimetype ?? null);
    if (!sameSize || !sameType) {
      return move(entry, 'failed', { errorCode: 'verify_mismatch' });
    }
    move(entry, 'verified');
  }

  async function refsStep(entry) {
    const root = roots[entry.root];
    const [result] = await op(() =>
      sql.write(
        root.refsUpdateSql({
          bucket,
          entry,
          from: entry.oldName,
          to: entry.newName,
          guard: true,
        })
      )
    );
    if (!result?.guard_ok || !result?.new_ok) {
      // CAS lost: the object changed (or vanished) after selection. Drop our
      // copy and leave the original untouched.
      await op(() => storage.remove([entry.newName]));
      return move(entry, 'skipped', { skipReason: 'changed_since_selection' });
    }
    const { guard_ok: _g, new_ok: _n, ...refs } = result;
    move(entry, 'refs_updated', { refs });
  }

  async function deleteStep(entry, { probe }) {
    if (probe)
      entry.probe = {
        url: await op(() => storage.sign(entry.oldName, 600)),
        status: null,
      };
    await op(() => storage.remove([entry.oldName]));
    if (await readObject({ name: entry.oldName }))
      throw new OperationError('old_still_present');
    if (probe) {
      entry.probe = {
        url: null,
        status: await op(() => storage.headStatus(entry.probe.url)),
      };
    }
    move(entry, 'old_deleted');
  }

  const steps = {
    selected: copyStep,
    copied: verifyStep,
    verified: refsStep,
    refs_updated: deleteStep,
  };

  async function advance(entry, options) {
    while (steps[entry.state]) {
      try {
        await steps[entry.state](entry, options);
      } catch (error) {
        if (error instanceof StopRequested) throw error;
        entry.attempts += 1;
        move(entry, 'failed', { errorCode: error?.code ?? 'unexpected' });
        return;
      }
    }
  }

  async function run({ root, batchSize, probeEvery = 0 }) {
    const size = Math.min(batchSize ?? MAX_BATCH_SIZE, MAX_BATCH_SIZE);
    let processed = 0;
    let stopped = null;
    try {
      for (;;) {
        const batch = pendingForRoot(ledger, root).slice(0, size);
        if (batch.length === 0) break;
        for (const entry of batch) {
          processed += 1;
          await advance(entry, {
            probe: probeEvery > 0 && (processed - 1) % probeEvery === 0,
          });
        }
        log('batch', {
          root,
          size: batch.length,
          opsUsed: fence.used,
          counts: countByState(rowsForRoot(ledger, root)),
        });
      }
    } catch (error) {
      if (!(error instanceof StopRequested)) throw error;
      stopped = error.reason;
    }
    save();
    return {
      stopped,
      opsUsed: fence.used,
      counts: countByState(rowsForRoot(ledger, root)),
    };
  }

  async function rollbackEntry(entry) {
    const root = roots[entry.root];
    if (entry.state === 'selected') return move(entry, 'rolled_back');
    const original = await readObject({ name: entry.oldName });
    if (!original) {
      // The old key is gone; restoring it would revive leaked tokens.
      log('rollback_refused', {
        id: entry.id,
        state: entry.state,
        reason: 'old_key_deleted',
      });
      return;
    }
    if (entry.newName) {
      await op(() =>
        sql.write(
          root.refsUpdateSql({
            bucket,
            entry,
            from: entry.newName,
            to: entry.oldName,
            guard: false,
          })
        )
      );
      if (await readObject({ name: entry.newName }))
        await op(() => storage.remove([entry.newName]));
    }
    move(entry, 'rolled_back');
  }

  async function rollback({ root }) {
    let stopped = null;
    const candidates = rowsForRoot(ledger, root).filter((entry) =>
      ['selected', 'copied', 'verified', 'refs_updated', 'failed'].includes(
        entry.state
      )
    );
    try {
      for (const entry of candidates) await rollbackEntry(entry);
    } catch (error) {
      if (!(error instanceof StopRequested)) throw error;
      stopped = error.reason;
    }
    save();
    const refused = rowsForRoot(ledger, root).filter(
      (entry) => entry.state === 'old_deleted'
    ).length;
    return {
      stopped,
      opsUsed: fence.used,
      oldDeletedNotRolledBack: refused,
      counts: countByState(rowsForRoot(ledger, root)),
    };
  }

  return { run, rollback, advance };
}
