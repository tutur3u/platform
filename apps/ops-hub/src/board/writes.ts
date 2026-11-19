import {
  changeDelegation,
  changeGrant,
  changeStop,
  parse,
  registerChannel,
  registration,
} from './admin';
import { encode, hash } from './assertion';
import { followup, key, messages, principal, uuid, watcher } from './contracts';
import type { Followups } from './followups';
import { claimInput, releaseInput, renewInput, type Leases } from './leases';
import { reject, type Store } from './store';
import type { Tasks } from './tasks';

import { post, replay, watch, type Input, type Replay } from './write-actions';

export class Writes {
  private claims = Promise.resolve();
  private claimCount = 0;

  constructor(
    readonly store: Store,
    readonly tasks: Tasks,
    readonly leases: Leases,
    readonly followups: Followups
  ) {}

  async fetch(method: string, path: string[], input: Input) {
    if (
      method !== 'POST' ||
      path.length !== 4 ||
      path[0] !== 'channels' ||
      path[2] !== 'leases' ||
      path[3] !== 'claim'
    ) {
      return this.execute(method, path, input);
    }
    if (this.claimCount >= 8) reject(429, 'budget_exhausted');
    this.claimCount++;
    const next = this.claims.then(() => this.execute(method, path, input));
    this.claims = next.then(
      () => {},
      () => {}
    );
    try {
      return await next;
    } finally {
      this.claimCount--;
    }
  }

  private async execute(method: string, path: string[], input: Input) {
    const { actor, json, idempotency, fingerprint } = input;
    const [resource, id, subject, item, leaf] = path;
    if (input.url.search) reject(400, 'invalid_request');
    const preflight = (now: number) => {
      if (actor.expiresAt <= now) reject(401, 'unauthenticated');
      this.store.admit(actor, now);
      if (
        resource === 'control' ||
        resource === 'delegations' ||
        (resource === 'channels' && (path.length === 1 || subject === 'grants'))
      ) {
        this.store.manager(actor, actor.issuedAt);
      }
      if (resource === 'channels' && path.length > 1) {
        const channel = parse(uuid, id);
        if (subject === 'threads')
          this.store.require(
            channel,
            actor,
            leaf === 'messages' ? 'writer' : 'operator',
            now
          );
        if (
          subject === 'followups' ||
          (subject === 'leases' && leaf !== 'release')
        )
          this.store.require(channel, actor, 'operator', now);
      }
      if (resource === 'watchers' && method === 'POST') {
        const watch = parse(watcher, json);
        if (watch.channelId)
          this.store.require(watch.channelId, actor, 'operator', now);
      }
    };
    const loadReplay = (now: number) => {
      const row = this.store.one<Replay>(
        'SELECT fingerprint,status,response_json FROM idempotency WHERE authenticated_user_id=? AND actor=? AND request_key=? AND expires_at>?',
        actor.userId,
        actor.actor,
        idempotency,
        now
      );
      if (row && row.fingerprint !== fingerprint)
        reject(409, 'idempotency_conflict');
      return row;
    };
    const previous = this.store.tx(() => {
      const now = Date.now();
      preflight(now);
      return loadReplay(now);
    });
    const claim =
      resource === 'channels' &&
      subject === 'leases' &&
      item === 'claim' &&
      path.length === 4 &&
      method === 'POST';
    if (previous)
      return replay(this.store, this.leases, input, previous, claim);

    const generation = this.store.control().generation;
    let preparedClaim: Awaited<ReturnType<Leases['prepareClaim']>> = null;
    let tokenHash: string | undefined;
    if (claim) {
      parse(claimInput, json);
      this.store.tx(() => {
        const now = Date.now();
        preflight(now);
        this.store.enabled(generation);
        this.store.charge(actor, 'claim', now);
      });
      preparedClaim = await this.leases.prepareClaim(
        actor,
        id,
        generation,
        idempotency
      );
    }
    if (resource === 'channels' && path.length === 1 && method === 'POST') {
      const registered = parse(registration, json);
      await this.tasks.project(actor, generation, registered.projectId);
    }
    if (
      resource === 'channels' &&
      subject === 'grants' &&
      path.length === 4 &&
      method === 'PUT'
    ) {
      const target = parse(principal, item);
      this.store.channel(id);
      await this.tasks.principal(actor, generation, target);
    }
    if (resource === 'delegations' && path.length === 3 && method === 'PUT') {
      await this.tasks.principal(
        actor,
        generation,
        `agent:${parse(key, id)}`,
        parse(uuid, subject)
      );
    }
    if (
      resource === 'channels' &&
      subject === 'threads' &&
      path.length === 5 &&
      method === 'POST'
    ) {
      if (leaf === 'messages') parse(messages, json, 'invalid_schema');
      else if (leaf === 'followups') parse(followup, json);
      else reject(404, 'not_found');
      await this.tasks.access(
        actor,
        generation,
        parse(uuid, id),
        parse(uuid, item)
      );
    }
    if (
      resource === 'channels' &&
      subject === 'leases' &&
      path.length === 5 &&
      method === 'POST'
    ) {
      if (leaf !== 'release' && leaf !== 'renew') reject(404, 'not_found');
      const { token } =
        leaf === 'release'
          ? parse(releaseInput, json)
          : parse(renewInput, json);
      tokenHash = await hash(encode(token));
    }

    const result = this.store.tx(() => {
      const now = Date.now();
      preflight(now);
      const replay = loadReplay(now);
      if (replay) return { replay };
      this.store.run(
        'DELETE FROM idempotency WHERE authenticated_user_id=? AND actor=? AND request_key=?',
        actor.userId,
        actor.actor,
        idempotency
      );
      this.store.run(
        'DELETE FROM idempotency WHERE rowid IN (SELECT rowid FROM idempotency WHERE expires_at<=? LIMIT 25)',
        now
      );
      const cleanup =
        method === 'DELETE' || leaf === 'release' || resource === 'control';
      this.store.replayCapacity(actor, cleanup, now);
      if (!cleanup) this.store.enabled(generation);
      let response: unknown;
      let status = 200;
      if (
        resource === 'control' &&
        id === 'stop' &&
        path.length === 2 &&
        method === 'PUT'
      ) {
        response = changeStop(this.store, actor, json, idempotency);
      } else if (
        resource === 'delegations' &&
        path.length === 3 &&
        ['PUT', 'DELETE'].includes(method)
      ) {
        response = changeDelegation(
          this.store,
          actor,
          id,
          subject,
          json,
          idempotency,
          now,
          method === 'DELETE'
        );
      } else if (
        resource === 'watchers' &&
        path.length === 1 &&
        method === 'POST'
      ) {
        response = watch(this.store, input, now);
        status = 201;
      } else if (
        resource === 'watchers' &&
        path.length === 2 &&
        method === 'DELETE'
      ) {
        const watcherId = parse(uuid, id);
        const row = this.store.one(
          'SELECT channel_id,disabled_at FROM watchers WHERE id=? AND owner_key=? AND owner_user_id=?',
          watcherId,
          actor.actor,
          actor.userId
        );
        if (!row) reject(404, 'not_found');
        if (row.disabled_at === null) {
          this.store.run(
            'UPDATE watchers SET disabled_at=? WHERE id=?',
            now,
            watcherId
          );
          this.store.audit(
            actor,
            'watcher.disabled',
            watcherId,
            typeof row.channel_id === 'string' ? row.channel_id : null,
            null,
            { disabled: true },
            idempotency
          );
        }
        response = { disabled: true };
      } else if (
        resource === 'channels' &&
        method === 'POST' &&
        path.length === 1
      ) {
        response = registerChannel(
          this.store,
          actor,
          parse(registration, json),
          idempotency,
          now
        );
        status = 201;
      } else if (
        resource === 'channels' &&
        subject === 'grants' &&
        path.length === 4 &&
        ['PUT', 'DELETE'].includes(method)
      ) {
        response = changeGrant(
          this.store,
          actor,
          id,
          item,
          json,
          idempotency,
          now,
          method === 'DELETE'
        );
      } else if (claim) {
        response = {
          lease: this.leases.claim(
            actor,
            id,
            idempotency,
            parse(claimInput, json).ttlMs,
            preparedClaim,
            generation,
            now
          ),
        };
      } else if (
        resource === 'channels' &&
        subject === 'leases' &&
        tokenHash &&
        method === 'POST'
      ) {
        const ttlMs =
          leaf === 'renew' ? parse(renewInput, json).ttlMs : undefined;
        response = this.leases.change(
          actor,
          id,
          parse(uuid, item),
          tokenHash,
          idempotency,
          now,
          ttlMs
        );
      } else if (
        resource === 'channels' &&
        subject === 'threads' &&
        path.length === 5 &&
        method === 'POST'
      ) {
        response =
          leaf === 'messages'
            ? post(this.store, input, id, item, now)
            : this.followups.create(
                actor,
                id,
                item,
                parse(followup, json),
                idempotency,
                now
              );
        status = 201;
      } else if (
        resource === 'channels' &&
        subject === 'followups' &&
        path.length === 4 &&
        method === 'DELETE'
      ) {
        response = this.followups.cancel(
          actor,
          id,
          parse(uuid, item),
          idempotency
        );
      } else {
        reject(404, 'not_found');
      }
      this.store.run(
        'INSERT INTO idempotency VALUES(?,?,?,?,?,?,?,?)',
        actor.userId,
        actor.actor,
        idempotency,
        fingerprint,
        status,
        JSON.stringify(response),
        now,
        now + 86_400_000
      );
      return { status, response };
    });
    if ('replay' in result && result.replay)
      return replay(this.store, this.leases, input, result.replay, claim);
    return {
      status: result.status,
      response:
        claim && preparedClaim
          ? {
              lease: {
                taskId: preparedClaim.taskId,
                channelId: id,
                holderKey: actor.actor,
                fence: preparedClaim.fence,
                expiresAt: this.leases.get(preparedClaim.taskId)?.expires_at,
                renewals: 0,
                token: preparedClaim.token,
              },
            }
          : result.response,
    };
  }
}
