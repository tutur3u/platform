import { recordDispatchDenial } from './revocation';
import { BoardError, type Store, system } from './store';
import type { Tasks } from './tasks';

interface Event extends Record<string, SqlStorageValue> {
  audit_seq: number;
  channel_id: string;
  task_id: string | null;
  event_bit: number;
  generation: number;
}
interface Watch extends Record<string, SqlStorageValue> {
  id: string;
  owner_key: string;
  owner_user_id: string;
  label_id: string | null;
  target_kind: string;
  target_ref: string;
}

export class WatcherEvents {
  constructor(
    readonly store: Store,
    readonly tasks: Tasks,
    readonly available: (kind: string) => boolean = () => false
  ) {}

  async drain() {
    const { generation } = this.store.enabled();
    this.store.run(
      'DELETE FROM watcher_events WHERE audit_seq IN (SELECT audit_seq FROM watcher_events WHERE generation<>? LIMIT 25)',
      generation
    );
    const pending = this.store.rows<Event>(
      'SELECT * FROM watcher_events WHERE generation=? AND retry_at<=? ORDER BY audit_seq LIMIT 5',
      generation,
      Date.now()
    );
    for (const event of pending) {
      if (this.store.count('followups') >= 5000) {
        this.store.run(
          'DELETE FROM watcher_events WHERE audit_seq=?',
          event.audit_seq
        );
        continue;
      }
      let accepted =
        this.store.one<{ count: number }>(
          'SELECT COUNT(*) AS count FROM deliveries WHERE audit_seq=?',
          event.audit_seq
        )?.count ?? 0;
      const watches = this.store.rows<Watch>(
        `
        SELECT * FROM watchers w WHERE disabled_at IS NULL AND (channel_id IS NULL OR channel_id=?)
          AND (event_mask & ?)<>0 AND created_at<=(SELECT at FROM audit WHERE seq=?)
          AND NOT EXISTS(SELECT 1 FROM deliveries d WHERE d.audit_seq=? AND d.watcher_id=w.id)
        ORDER BY id LIMIT 256`,
        event.channel_id,
        event.event_bit,
        event.audit_seq,
        event.audit_seq
      );
      for (const watch of watches) {
        if (accepted >= 8) break;
        const owner = {
          actor: watch.owner_key,
          userId: watch.owner_user_id,
        };
        if (!this.available(watch.target_kind)) continue;
        try {
          const delegated = this.store.tx(() => {
            if (!this.store.delegated(owner, Date.now())) return false;
            this.store.requireRole(
              event.channel_id,
              owner.actor,
              'operator',
              Date.now()
            );
            return true;
          });
          if (!delegated) continue;
          const identity = await this.tasks.dispatchActor(owner, generation);
          if (!identity.allowed) {
            this.store.tx(() => {
              this.store.enabled(generation);
              recordDispatchDenial(
                this.store,
                owner,
                identity.reason,
                watch.id,
                event.channel_id
              );
            });
            continue;
          }
          const { actor } = identity;
          if (watch.label_id) {
            if (!event.task_id) continue;
            const state = await this.tasks.access(
              actor,
              generation,
              event.channel_id,
              event.task_id
            );
            if (!state.labelIds.includes(watch.label_id)) continue;
          }
          const created = this.store.tx(() => {
            const now = Date.now();
            this.store.enabled(event.generation);
            this.store.require(event.channel_id, actor, 'operator', now);
            if (
              !this.store.one(
                'SELECT 1 FROM watchers WHERE id=? AND disabled_at IS NULL',
                watch.id
              ) ||
              this.store.one(
                'SELECT 1 FROM deliveries WHERE audit_seq=? AND watcher_id=?',
                event.audit_seq,
                watch.id
              )
            )
              return false;
            this.store.capacity('followups', 5000);
            const id = crypto.randomUUID();
            const delivery = crypto.randomUUID();
            this.store.run(
              `INSERT INTO followups VALUES (?,?,?,?,?,?,?,'notify',?,0,'pending',?,NULL,?,?,NULL)`,
              id,
              event.task_id ?? event.channel_id,
              event.channel_id,
              owner.actor,
              owner.userId,
              now,
              now,
              JSON.stringify({
                target: { kind: watch.target_kind, ref: watch.target_ref },
                eventRef: delivery,
              }),
              event.generation,
              now,
              now
            );
            this.store.run(
              'INSERT INTO deliveries VALUES(?,?,?,?)',
              delivery,
              event.audit_seq,
              watch.id,
              id
            );
            this.store.audit(
              system,
              'watcher.delivery_created',
              id,
              event.channel_id,
              null,
              { watcherId: watch.id }
            );
            return true;
          });
          if (created) accepted++;
        } catch (error) {
          if (!(error instanceof BoardError)) throw error;
          if (error.status === 429 && error.code === 'budget_exhausted') return;
          if (error.code === 'board_stopped') return;
          if (error.status === 503) {
            this.store.run(
              'UPDATE watcher_events SET retry_at=? WHERE audit_seq=?',
              Date.now() + 60_000,
              event.audit_seq
            );
            return;
          }
        }
      }
      this.store.run(
        'DELETE FROM watcher_events WHERE audit_seq=?',
        event.audit_seq
      );
    }
  }
}
