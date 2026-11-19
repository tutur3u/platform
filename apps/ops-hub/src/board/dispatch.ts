import type { Job } from './contracts';
import type { Followups } from './followups';
import { recordDispatchDenial } from './revocation';
import { BoardError, reject, system } from './store';

export async function consume(followups: Followups, envelope: Job) {
  const { store, tasks } = followups;
  const queued = () => {
    const row = followups.get(envelope.id);
    const control = store.control();
    if (
      !row ||
      control.stopped ||
      row.generation !== control.generation ||
      row.generation !== envelope.generation ||
      row.state !== 'queued' ||
      row.attempts !== envelope.attempt
    )
      return;
    return row;
  };
  const row = store.tx(queued);
  if (!row) return false;
  const owner = { actor: row.owner_key, userId: row.owner_user_id };
  let done = false;
  let code = 'not_done';
  try {
    store.tx(() => {
      if (!store.delegated(owner, Date.now())) reject(403, 'forbidden');
      store.requireRole(row.channel_id, owner.actor, 'operator', Date.now());
      if (row.kind !== 'verify_task') reject(503, 'adapter_unavailable');
    });
    const identity = await tasks.dispatchActor(owner, row.generation);
    const started = store.tx(() => {
      const current = queued();
      if (!current) return false;
      if (!identity.allowed) {
        recordDispatchDenial(
          store,
          owner,
          identity.reason,
          current.id,
          current.channel_id
        );
        if (followups.get(current.id)?.state === 'queued')
          followups.finish(
            current,
            'cancelled',
            'authorization_lost',
            system,
            null,
            false
          );
        return true;
      }
      store.require(current.channel_id, identity.actor, 'operator', Date.now());
      store.run(
        "UPDATE followups SET state='delivering',updated_at=? WHERE id=?",
        Date.now(),
        current.id
      );
      store.audit(
        system,
        'followup.delivering',
        current.id,
        current.channel_id,
        { state: 'queued' },
        { state: 'delivering' }
      );
      return true;
    });
    if (!started) return false;
    if (!identity.allowed) return true;
    done = (
      await tasks.access(
        identity.actor,
        row.generation,
        row.channel_id,
        row.task_id
      )
    ).done;
  } catch (error) {
    code = error instanceof BoardError ? error.code : 'tasks_unavailable';
  }
  return store.tx(() => {
    const current = followups.get(row.id);
    if (
      !current ||
      !['queued', 'delivering'].includes(current.state) ||
      current.attempts !== envelope.attempt
    )
      return false;
    const control = store.control();
    if (control.stopped || control.generation !== current.generation) {
      if (current.state === 'delivering') {
        followups.finish(
          current,
          done ? 'succeeded' : 'cancelled',
          done ? 'verified' : 'stopped'
        );
      }
      return false;
    }
    if (current.state === 'delivering') {
      try {
        if (!store.delegated(owner, Date.now())) reject(403, 'forbidden');
        store.requireRole(
          current.channel_id,
          owner.actor,
          'operator',
          Date.now()
        );
      } catch (error) {
        if (!(error instanceof BoardError)) throw error;
        followups.finish(
          current,
          done ? 'succeeded' : 'cancelled',
          done ? 'verified' : 'authorization_lost',
          system,
          null,
          false
        );
        return false;
      }
    }
    if (done) followups.finish(current, 'succeeded', 'verified');
    else if (code === 'adapter_unavailable')
      followups.finish(current, 'failed', code);
    else if (['forbidden', 'not_found'].includes(code))
      followups.finish(current, 'cancelled', code);
    else if (code === 'budget_exhausted') {
      const now = Date.now();
      const next = now - (now % 3_600_000) + 3_600_000;
      store.run(
        "UPDATE followups SET state='pending',attempts=attempts-1,next_at=?,attempt_deadline=NULL,updated_at=? WHERE id=?",
        next,
        now,
        current.id
      );
      store.audit(
        system,
        'followup.deferred',
        current.id,
        current.channel_id,
        { state: current.state },
        { state: 'pending', code }
      );
    } else followups.retry(current, code);
    return !store.control().stopped;
  });
}
