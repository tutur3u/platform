import { consume } from './dispatch';
import { removeDelegation } from './revocation';
import { followup, type Job, type Identity } from './contracts';
import { BoardError, reject, type Store, system } from './store';
import type { Tasks } from './tasks';
import type { Leases } from './leases';
import { schedule } from './schedule';
import { WatcherEvents } from './watcher-events';

export interface Followup extends Record<string, SqlStorageValue> {
  id: string;
  task_id: string;
  channel_id: string;
  owner_key: string;
  owner_user_id: string;
  due_at: number;
  kind: string;
  payload_json: string;
  attempts: number;
  state: string;
  generation: number;
  terminal_code: string | null;
  created_at: number;
  updated_at: number;
}

export function followupView(row: Followup, generation: number) {
  const stale =
    row.generation !== generation && ['pending', 'queued'].includes(row.state);
  return {
    id: row.id,
    channelId: row.channel_id,
    taskId: row.task_id,
    ownerKey: row.owner_key,
    dueAt: row.due_at,
    kind: row.kind,
    attempts: row.attempts,
    state: stale ? 'cancelled' : row.state,
    terminalCode: stale ? 'stopped' : row.terminal_code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class Followups {
  private readonly consuming = new Set<string>();
  constructor(
    readonly store: Store,
    readonly tasks: Tasks,
    readonly leases: Leases,
    readonly queue: Queue<Job>
  ) {}

  create(
    actor: Identity,
    channel: string,
    task: string,
    input: ReturnType<typeof followup.parse>,
    requestId: string,
    now: number
  ) {
    const { generation } = this.store.enabled();
    if (input.dueAt < now || input.dueAt > now + 30 * 86_400_000)
      reject(422, 'invalid_reference');
    // The wake bridge must expose owner registration and audience authorization before admission.
    if (input.kind === 'notify') reject(503, 'adapter_unavailable');
    this.store.capacity('followups', 5000);
    this.store.charge(actor, 'followup', now);
    const id = crypto.randomUUID();
    this.store.run(
      `INSERT INTO followups VALUES(?,?,?,?,?,?,?,?,?,0,'pending',?,NULL,?,?,NULL)`,
      id,
      task,
      channel,
      actor.actor,
      actor.userId,
      input.dueAt,
      input.dueAt,
      input.kind,
      JSON.stringify(input.payload),
      generation,
      now,
      now
    );
    const row = this.get(id);
    if (!row) throw new Error('Follow-up missing');
    const view = followupView(row, generation);
    this.store.audit(
      actor,
      'followup.created',
      id,
      channel,
      null,
      view,
      requestId
    );
    return view;
  }

  get(id: string) {
    return this.store.one<Followup>('SELECT * FROM followups WHERE id=?', id);
  }

  cancel(actor: Identity, channel: string, id: string, requestId: string) {
    const row = this.get(id);
    if (
      !row ||
      row.channel_id !== channel ||
      row.owner_key !== actor.actor ||
      row.owner_user_id !== actor.userId
    )
      reject(404, 'not_found');
    if (!['pending', 'queued'].includes(row.state))
      reject(409, 'state_conflict');
    this.store.charge(actor, 'cancel', Date.now());
    this.finish(row, 'cancelled', 'cancelled', actor, requestId);
    return { state: 'cancelled' };
  }

  finish(
    row: Followup,
    state: 'failed' | 'succeeded' | 'cancelled',
    code: string,
    actor = system,
    requestId: string | null = null,
    publishEvent = true
  ) {
    this.store.run(
      'UPDATE followups SET state=?,terminal_code=?,next_at=NULL,attempt_deadline=NULL,updated_at=? WHERE id=?',
      state,
      code,
      Date.now(),
      row.id
    );
    this.store.audit(
      actor,
      'followup.terminal',
      row.id,
      row.channel_id,
      { state: row.state, attempts: row.attempts },
      { state, code, attempts: row.attempts },
      requestId,
      publishEvent ? row.generation : null
    );
  }

  retry(row: Followup, code: string) {
    if (row.attempts >= 3) return this.finish(row, 'failed', code);
    const now = Date.now();
    this.store.run(
      "UPDATE followups SET state='pending',next_at=?,attempt_deadline=NULL,updated_at=? WHERE id=?",
      now + (row.attempts === 1 ? 60_000 : 300_000),
      now,
      row.id
    );
    this.store.audit(
      system,
      'followup.retry',
      row.id,
      row.channel_id,
      { state: row.state },
      { state: 'pending', code }
    );
  }

  async enqueue(row: Followup, name: string) {
    const [, workspaceId, boardId] = name.split(':');
    const now = Date.now();
    if (this.get(row.id)?.state !== 'pending') return;
    this.store.reserve('queue_sends', row.generation);
    const attempt = row.attempts + 1;
    this.store.tx(() => {
      this.store.run(
        "UPDATE followups SET state='queued',attempts=?,attempt_deadline=?,next_at=NULL,updated_at=? WHERE id=?",
        attempt,
        now + 120_000,
        now,
        row.id
      );
      this.store.audit(
        system,
        'followup.queued',
        row.id,
        row.channel_id,
        { state: 'pending' },
        { state: 'queued', attempt }
      );
    });
    this.store.enabled(row.generation);
    try {
      await this.queue.send({
        workspaceId,
        boardId,
        id: row.id,
        attempt,
        generation: row.generation,
      });
    } catch {
      this.store.tx(() => {
        const current = this.get(row.id);
        if (current?.state !== 'queued' || current.attempts !== attempt) return;
        if (this.store.control().generation !== current.generation)
          this.finish(current, 'cancelled', 'stopped');
        else this.retry(current, 'queue_unavailable');
      });
    }
  }

  async consume(envelope: Job) {
    if (this.consuming.has(envelope.id)) return false;
    this.consuming.add(envelope.id);
    try {
      return await consume(this, envelope);
    } finally {
      this.consuming.delete(envelope.id);
    }
  }

  async alarm(name: string) {
    const now = Date.now();
    this.store.tx(() => {
      this.store.run('UPDATE control SET alarm_at=NULL WHERE id=1');
      this.leases.expire(now);
      for (const row of this.store.rows(
        'SELECT * FROM grants WHERE expires_at<=? LIMIT 25',
        now
      )) {
        this.store.run(
          'DELETE FROM grants WHERE channel_id=? AND principal=?',
          row.channel_id,
          row.principal
        );
        this.store.audit(
          system,
          'grant.expired',
          String(row.principal),
          String(row.channel_id),
          { role: row.role },
          null
        );
      }
      for (const row of this.store.rows(
        'SELECT * FROM delegations WHERE expires_at<=? LIMIT 25',
        now
      )) {
        removeDelegation(
          this.store,
          system,
          String(row.agent_key),
          String(row.user_id),
          now,
          'delegation.expired'
        );
      }
      this.store.run(
        'DELETE FROM idempotency WHERE rowid IN (SELECT rowid FROM idempotency WHERE expires_at<=? LIMIT 25)',
        now
      );
      const { generation } = this.store.control();
      for (const row of this.store.rows<Followup>(
        `SELECT * FROM followups
        WHERE (state IN ('pending','queued') AND generation<>?) OR
        (state IN ('queued','delivering') AND attempt_deadline<=?) LIMIT 25`,
        generation,
        now
      )) {
        if (row.state === 'delivering')
          this.finish(row, 'failed', 'delivery_unknown');
        else if (row.generation !== generation)
          this.finish(row, 'cancelled', 'stopped');
        else this.retry(row, 'queue_timeout');
      }
    });
    if (this.store.control().stopped) return;
    await new WatcherEvents(this.store, this.tasks).drain();
    for (const row of this.store.rows<Followup>(
      "SELECT * FROM followups WHERE state='pending' AND next_at<=? AND generation=? ORDER BY next_at,id LIMIT 10",
      now,
      this.store.control().generation
    )) {
      try {
        if (row.kind !== 'verify_task') {
          this.store.tx(() =>
            this.finish(row, 'failed', 'adapter_unavailable')
          );
          continue;
        }
        await this.enqueue(row, name);
      } catch (error) {
        if (
          !(error instanceof BoardError) ||
          ![429, 503].includes(error.status)
        )
          throw error;
        break;
      }
    }
    await schedule(this.store);
  }
}
