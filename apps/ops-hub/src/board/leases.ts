import { z } from 'zod';
import { base64 } from '../protocol';
import { encode, hash } from './assertion';
import { type Identity, ttl } from './contracts';
import { BoardError, reject, type Store, system } from './store';
import type { Tasks } from './tasks';

export const claimInput = z.strictObject({ ttlMs: ttl });
export const renewInput = z.strictObject({
  token: z.string().length(44),
  ttlMs: ttl,
});
export const releaseInput = z.strictObject({ token: z.string().length(44) });

interface Lease extends Record<string, SqlStorageValue> {
  task_id: string;
  channel_id: string;
  holder_key: string;
  holder_user_id: string;
  token_hash: string;
  fence: number;
  expires_at: number;
  claimed_at: number;
  renewals: number;
}

export function leaseView(lease: Lease) {
  return {
    taskId: lease.task_id,
    channelId: lease.channel_id,
    holderKey: lease.holder_key,
    fence: lease.fence,
    expiresAt: lease.expires_at,
    renewals: lease.renewals,
  };
}

export class Leases {
  constructor(
    readonly store: Store,
    readonly tasks: Tasks,
    readonly secret: string
  ) {}

  get(taskId: string) {
    return this.store.one<Lease>(
      'SELECT * FROM leases WHERE task_id=?',
      taskId
    );
  }

  async token(
    actor: Identity,
    taskId: string,
    requestKey: string,
    fence: number
  ) {
    if (this.secret.length < 32) reject(503, 'adapter_unavailable');
    const key = await crypto.subtle.importKey(
      'raw',
      encode(this.secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    return base64(
      await crypto.subtle.sign(
        'HMAC',
        key,
        encode(
          JSON.stringify([
            'board-lease-v2',
            this.tasks.name,
            actor.actor,
            actor.userId,
            taskId,
            requestKey,
            fence,
          ])
        )
      )
    );
  }

  expire(now: number) {
    for (const lease of this.store.rows<Lease>(
      'SELECT * FROM leases WHERE expires_at<=? ORDER BY expires_at,task_id LIMIT 25',
      now
    )) {
      this.expireOne(lease);
    }
  }

  expireOne(lease: Lease) {
    this.store.run('DELETE FROM leases WHERE task_id=?', lease.task_id);
    return this.store.audit(
      system,
      'lease.expired',
      lease.task_id,
      lease.channel_id,
      leaseView(lease),
      null
    );
  }

  async prepareClaim(
    actor: Identity,
    channel: string,
    generation: number,
    requestKey: string
  ) {
    let cursor: string | undefined;
    for (let index = 0; index < 4; index++) {
      const result = await this.tasks.candidates(
        actor,
        generation,
        channel,
        cursor
      );
      for (const item of result.candidates) {
        if (
          item.projectId !== channel ||
          item.done ||
          !item.eligible ||
          item.blockedBy.some((blocker) => !blocker.done)
        )
          continue;
        const now = Date.now();
        const current = this.get(item.taskId);
        if (current && current.expires_at > now) continue;
        try {
          await this.tasks.access(actor, generation, channel, item.taskId);
        } catch (error) {
          if (error instanceof BoardError && error.status === 404) continue;
          throw error;
        }
        const fence = this.store.enabled(generation).next_fence + 1;
        const token = await this.token(actor, item.taskId, requestKey, fence);
        return {
          taskId: item.taskId,
          asOf: result.asOf,
          fence,
          token,
          tokenHash: await hash(encode(token)),
        };
      }
      if (!result.nextCursor) break;
      cursor = result.nextCursor;
    }
    return null;
  }

  claim(
    actor: Identity,
    channel: string,
    requestKey: string,
    ttlMs: number,
    prepared: Awaited<ReturnType<Leases['prepareClaim']>>,
    generation: number,
    now: number
  ) {
    const control = this.store.enabled(generation);
    this.store.require(channel, actor, 'operator', now);
    if (!prepared) return null;
    if (prepared.asOf > now || prepared.asOf < now - 5000)
      reject(503, 'tasks_unavailable');
    const previous = this.get(prepared.taskId);
    if (
      control.next_fence + 1 !== prepared.fence ||
      (previous && previous.expires_at > now)
    )
      reject(409, 'state_conflict');
    if (previous) this.expireOne(previous);
    this.store.capacity('leases', 256);
    this.store.run(
      'UPDATE control SET next_fence=? WHERE id=1',
      prepared.fence
    );
    this.store.run(
      'INSERT INTO leases VALUES (?,?,?,?,?,?,?,?,0)',
      prepared.taskId,
      channel,
      actor.actor,
      actor.userId,
      prepared.tokenHash,
      prepared.fence,
      now,
      now + ttlMs
    );
    const view = {
      taskId: prepared.taskId,
      channelId: channel,
      holderKey: actor.actor,
      fence: prepared.fence,
      expiresAt: now + ttlMs,
      renewals: 0,
    };
    this.store.audit(
      actor,
      'lease.claimed',
      prepared.taskId,
      channel,
      null,
      view,
      requestKey
    );
    return view;
  }

  change(
    actor: Identity,
    channel: string,
    taskId: string,
    tokenHash: string,
    requestKey: string,
    now: number,
    ttlMs?: number
  ) {
    this.store.admit(actor, now);
    const lease = this.get(taskId);
    if (
      !lease ||
      lease.channel_id !== channel ||
      lease.holder_key !== actor.actor ||
      lease.holder_user_id !== actor.userId ||
      lease.token_hash !== tokenHash ||
      lease.expires_at <= now
    ) {
      reject(409, 'lease_lost');
    }
    if (ttlMs === undefined) {
      this.store.run('DELETE FROM leases WHERE task_id=?', taskId);
      this.store.audit(
        actor,
        'lease.released',
        taskId,
        channel,
        leaseView(lease),
        null,
        requestKey
      );
      return { released: true };
    }
    this.store.enabled();
    this.store.require(channel, actor, 'operator', now);
    this.store.charge(actor, 'renew', now);
    const expiresAt = Math.min(now + ttlMs, lease.claimed_at + 1_800_000);
    if (expiresAt <= lease.expires_at || lease.renewals >= 5)
      reject(409, 'lease_limit');
    this.store.run(
      'UPDATE leases SET expires_at=?,renewals=renewals+1 WHERE task_id=?',
      expiresAt,
      taskId
    );
    const next = {
      ...leaseView(lease),
      expiresAt,
      renewals: lease.renewals + 1,
    };
    this.store.audit(
      actor,
      'lease.renewed',
      taskId,
      channel,
      leaseView(lease),
      next,
      requestKey
    );
    return next;
  }
}
