import type { Identity } from './contracts';
import { schema } from './schema';

export class BoardError extends Error {
  constructor(
    readonly status: number,
    readonly code: string
  ) {
    super(code);
  }
}

export function reject(status: number, code: string): never {
  throw new BoardError(status, code);
}

export function errorResponse(error: unknown) {
  if (error instanceof BoardError) {
    return Response.json(
      { error: { code: error.code, message: error.code.replaceAll('_', ' ') } },
      {
        status: error.status,
        headers: {
          'Cache-Control': 'private, no-store',
          ...(error.status === 429
            ? {
                'Retry-After': String(
                  Math.ceil((3_600_000 - (Date.now() % 3_600_000)) / 1000)
                ),
              }
            : {}),
        },
      }
    );
  }
  console.error('Board operation failed');
  return Response.json(
    { error: { code: 'internal_error', message: 'Internal error' } },
    { status: 500 }
  );
}

export type Actor = Pick<Identity, 'userId' | 'manager' | 'agentActive'> & {
  actor: string;
};
type Budget = 'tasks_reads' | 'queue_sends' | 'adapter_calls' | 'alarm_sets';
type Control = {
  stopped: number;
  generation: number;
  next_fence: number;
  window_start: number;
  alarm_at: number | null;
} & Record<Budget, number>;
type Channel = { id: string; slug: string; policy: 'standard' | 'restricted' };
type Role = 'reader' | 'writer' | 'operator';
const ranks: Record<Role, number> = { reader: 1, writer: 2, operator: 3 };
export const system: Actor = {
  actor: 'system:board',
  userId: '',
  manager: false,
  agentActive: false,
};

export class Store {
  constructor(readonly storage: DurableObjectStorage) {
    storage.sql.exec(schema);
    if (
      !this.rows<{ name: string }>('PRAGMA table_info(watcher_events)').some(
        (column) => column.name === 'retry_at'
      )
    ) {
      this.run(
        'ALTER TABLE watcher_events ADD COLUMN retry_at INTEGER NOT NULL DEFAULT 0'
      );
    }
  }

  rows<T extends Record<string, SqlStorageValue>>(
    query: string,
    ...args: SqlStorageValue[]
  ) {
    return this.storage.sql.exec<T>(query, ...args).toArray();
  }

  one<T extends Record<string, SqlStorageValue>>(
    query: string,
    ...args: SqlStorageValue[]
  ) {
    return this.rows<T>(query, ...args)[0];
  }

  run(query: string, ...args: SqlStorageValue[]) {
    return this.storage.sql.exec(query, ...args);
  }

  tx<T>(operation: () => T): T {
    return this.storage.transactionSync(operation);
  }

  control() {
    const control = this.one<Control>('SELECT * FROM control WHERE id=1');
    if (!control) throw new Error('Board control missing');
    return control;
  }

  active(actor: Actor, now: number) {
    return (
      (!actor.actor.startsWith('agent:') || actor.agentActive) &&
      this.delegated(actor, now)
    );
  }

  delegated(actor: Pick<Actor, 'actor' | 'userId'>, now: number) {
    if (!actor.actor.startsWith('agent:')) return true;
    return !!this.one(
      'SELECT 1 FROM delegations WHERE agent_key=? AND user_id=? AND expires_at>?',
      actor.actor.slice(6),
      actor.userId,
      now
    );
  }

  admit(actor: Actor, now: number) {
    if (!this.active(actor, now)) reject(403, 'forbidden');
  }

  manager(actor: Actor, issuedAt?: number) {
    if (!actor.manager || actor.actor !== `user:${actor.userId}`)
      reject(403, 'forbidden');
    if (issuedAt !== undefined && Date.now() - issuedAt > 15_000)
      reject(401, 'unauthenticated');
  }

  channel(id: string) {
    const channel = this.one<Channel>(
      'SELECT id,slug,policy FROM channels WHERE id=?',
      id
    );
    if (!channel) reject(404, 'not_found');
    return channel;
  }

  explain(channel: Channel, actor: string, now: number) {
    const grant = this.one<{ role: Role; expiresAt: number | null }>(
      'SELECT role, expires_at AS expiresAt FROM grants WHERE channel_id=? AND principal=? AND (expires_at IS NULL OR expires_at>?)',
      channel.id,
      actor,
      now
    );
    if (grant) return { ...grant, source: 'grant' };
    return channel.policy === 'standard'
      ? { role: 'reader' as const, source: 'default', expiresAt: null }
      : { role: null, source: 'none', expiresAt: null };
  }

  require(channelId: string, actor: Actor, required: Role, now: number) {
    this.admit(actor, now);
    return this.requireRole(channelId, actor.actor, required, now);
  }

  requireRole(channelId: string, actor: string, required: Role, now: number) {
    const channel = this.channel(channelId);
    const { role } = this.explain(channel, actor, now);
    if (!role) reject(404, 'not_found');
    if (ranks[role] < ranks[required]) reject(403, 'forbidden');
    return channel;
  }

  audit(
    actor: Actor,
    action: string,
    target: string,
    channel: string | null,
    before: unknown,
    after: unknown,
    request: string | null = null,
    eventGeneration?: number
  ) {
    if (
      (this.one<{ seq: number }>('SELECT MAX(seq) AS seq FROM audit')?.seq ??
        0) >= 250_000
    )
      reject(503, 'board_stopped');
    const row = this.one<{ seq: number }>(
      'INSERT INTO audit(at,actor,authenticated_user_id,action,channel_id,target,before_json,after_json,request_id) VALUES (?,?,?,?,?,?,?,?,?) RETURNING seq',
      Date.now(),
      actor.actor,
      actor.userId || null,
      action,
      channel,
      target,
      before == null ? null : JSON.stringify(before),
      after == null ? null : JSON.stringify(after),
      request
    );
    const bits: Record<string, number> = {
      'message.posted': 1,
      'lease.claimed': 2,
      'lease.released': 4,
      'lease.expired': 8,
      'followup.terminal': 16,
      'grant.changed': 32,
      'grant.revoked': 32,
      'grant.expired': 32,
    };
    const control = this.control();
    const bit = bits[action];
    if (
      row &&
      channel &&
      bit &&
      !control.stopped &&
      (eventGeneration === undefined || eventGeneration === control.generation)
    ) {
      const followup =
        bit === 16
          ? this.one<{ task_id: string }>(
              'SELECT task_id FROM followups WHERE id=? AND NOT EXISTS(SELECT 1 FROM deliveries WHERE followup_id=?)',
              target,
              target
            )
          : undefined;
      const postedTask =
        bit === 1 && after && typeof after === 'object' && 'taskId' in after
          ? after.taskId
          : null;
      const task =
        bit === 16
          ? followup?.task_id
          : bit === 1
            ? postedTask
            : bit === 32
              ? null
              : target;
      if (bit !== 16 || followup) {
        this.run(
          'INSERT INTO watcher_events(audit_seq,channel_id,task_id,event_bit,generation) VALUES(?,?,?,?,?)',
          row.seq,
          channel,
          typeof task === 'string' ? task : null,
          bit,
          control.generation
        );
      }
    }
    if (row && row.seq >= 240_000 && !this.control().stopped) {
      this.run(
        'UPDATE control SET stopped=1,generation=generation+1 WHERE id=1'
      );
      this.audit(system, 'board.auto_stopped', 'board', null, null, {
        reason: 'audit_capacity',
      });
    }
    return row?.seq;
  }

  count(
    table:
      | 'audit'
      | 'channels'
      | 'watchers'
      | 'leases'
      | 'messages'
      | 'followups'
      | 'idempotency'
      | 'delegations'
  ) {
    return (
      this.one<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table}`)
        ?.count ?? 0
    );
  }

  capacity(table: Parameters<Store['count']>[0], max: number) {
    if (this.count(table) >= max) reject(429, 'budget_exhausted');
  }

  replayCapacity(actor: Actor, cleanup: boolean, now: number) {
    this.capacity('idempotency', cleanup ? 5000 : 4750);
    const row = this.one<{ count: number }>(
      'SELECT COUNT(*) AS count FROM idempotency WHERE actor=? AND expires_at>?',
      actor.actor,
      now
    );
    if ((row?.count ?? 0) >= (cleanup ? 250 : 200))
      reject(429, 'budget_exhausted');
  }

  enabled(generation?: number) {
    const control = this.control();
    if (
      control.stopped ||
      (generation !== undefined && generation !== control.generation)
    )
      reject(503, 'board_stopped');
    return control;
  }

  reserve(counter: Budget, generation: number, limit?: number) {
    const now = Date.now();
    const caps: Record<Budget, number> = {
      tasks_reads: 120,
      queue_sends: 60,
      adapter_calls: 60,
      alarm_sets: 120,
    };
    this.tx(() => {
      const control = this.enabled(generation);
      const window = now - (now % 3_600_000);
      if (control.window_start !== window) {
        this.run(
          'UPDATE control SET window_start=?,tasks_reads=0,queue_sends=0,adapter_calls=0,alarm_sets=0 WHERE id=1',
          window
        );
      } else if (control[counter] >= (limit ?? caps[counter])) {
        reject(429, 'budget_exhausted');
      }
      this.run(`UPDATE control SET ${counter}=${counter}+1 WHERE id=1`);
    });
  }

  charge(
    actor: Actor,
    operation:
      | 'message'
      | 'claim'
      | 'followup'
      | 'renew'
      | 'watcher'
      | 'cancel',
    now: number
  ) {
    const window = now - (now % 3_600_000);
    const cap =
      operation === 'message' ? 60 : operation === 'watcher' ? 15 : 30;
    const result = this.one<{ used: number }>(
      `
      INSERT INTO actor_budget VALUES(?,?,?,1)
      ON CONFLICT(actor,operation) DO UPDATE SET window_start=excluded.window_start,
        used=CASE WHEN window_start=excluded.window_start THEN used+1 ELSE 1 END
      WHERE window_start<>excluded.window_start OR used<?
      RETURNING used
    `,
      actor.actor,
      operation,
      window,
      cap
    );
    if (!result) reject(429, 'budget_exhausted');
  }
}
