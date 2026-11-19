import { z } from 'zod';
import { base64, bytesFromBase64 } from '../protocol';
import {
  delegationProjection,
  grantProjection,
  parse,
  stopView,
} from './admin';
import { decodeBoardPayload, encode } from './assertion';
import { principal, uuid, type Identity } from './contracts';
import { followupView, type Followups } from './followups';
import { BoardError, reject, type Store } from './store';
import type { Tasks } from './tasks';

const limitSchema = z
  .string()
  .regex(/^[1-9][0-9]{0,2}$/)
  .transform(Number)
  .pipe(z.int().max(100));
const seqSchema = z
  .string()
  .regex(/^(0|[1-9][0-9]{0,14})$/)
  .transform(Number);

export class Reads {
  private readonly taskAccess = new Map<
    string,
    { expiresAt: number; allowed: boolean }
  >();

  constructor(
    readonly store: Store,
    readonly tasks: Tasks,
    readonly followups: Followups,
    readonly secret: string
  ) {}

  async pagination(url: URL, actor: Identity) {
    const limit = parse(limitSchema, url.searchParams.get('limit') ?? '25');
    const cursor = url.searchParams.get('cursor');
    if (cursor && cursor.length > 2400) reject(400, 'invalid_request');
    if (this.secret.length < 32) reject(503, 'adapter_unavailable');
    const context = new URL(url);
    context.searchParams.delete('cursor');
    context.searchParams.sort();
    const key = await crypto.subtle.importKey(
      'raw',
      encode(this.secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign', 'verify']
    );
    const scoped = (payload: string) =>
      encode(
        JSON.stringify([
          'board-cursor-v2',
          this.tasks.name,
          actor.userId,
          actor.actor,
          context.pathname,
          context.search,
          payload,
        ])
      );
    let position: number | string = 0;
    if (cursor) {
      try {
        const [payload, signature, extra] = cursor.split('.');
        if (
          !payload ||
          !signature ||
          extra !== undefined ||
          !(await crypto.subtle.verify(
            'HMAC',
            key,
            bytesFromBase64(signature),
            scoped(payload)
          ))
        )
          throw new Error();
        position = z
          .union([z.int().min(0).max(250_000), z.string().max(1024)])
          .parse(
            JSON.parse(
              new TextDecoder().decode(decodeBoardPayload(payload, 2400))
            )
          );
      } catch {
        reject(400, 'invalid_request');
      }
    }
    const seal = async (next: number | string | null) => {
      if (next === null) return null;
      const payload = base64(encode(JSON.stringify(next)).buffer);
      return `${payload}.${base64(await crypto.subtle.sign('HMAC', key, scoped(payload)))}`;
    };
    return { limit, position, seal };
  }

  async fetch(actor: Identity, path: string[], url: URL) {
    const [resource, channel, subject, task, leaf] = path;
    const now = Date.now();
    if (resource === 'control' && channel === 'stop' && path.length === 2) {
      return this.store.tx(() => {
        this.store.manager(actor);
        return stopView(this.store);
      });
    }
    if (resource === 'channels' && subject === 'explain' && path.length === 3) {
      return this.store.tx(() => {
        this.store.admit(actor, now);
        const target = parse(
          principal,
          url.searchParams.get('principal') ?? actor.actor
        );
        const item = this.store.channel(parse(uuid, channel));
        this.store.require(item.id, actor, 'reader', now);
        if (target !== actor.actor) this.store.manager(actor);
        return { principal: target, ...this.store.explain(item, target, now) };
      });
    }
    if (resource === 'audit' && path.length === 1)
      return this.audit(actor, url, now);
    const { limit, position, seal } = await this.pagination(url, actor);
    if (resource === 'channels' && subject === 'threads' && path.length === 3) {
      const project = parse(uuid, channel);
      const generation = this.store.tx(() => {
        this.store.require(project, actor, 'reader', Date.now());
        return this.store.enabled().generation;
      });
      const result = await this.tasks.threads(
        actor,
        generation,
        project,
        limit,
        typeof position === 'string' ? position : undefined
      );
      this.store.tx(() => {
        this.store.enabled(generation);
        this.store.require(project, actor, 'reader', Date.now());
      });
      return { items: result.items, nextCursor: await seal(result.nextCursor) };
    }
    const messageGeneration =
      resource === 'channels' &&
      subject === 'threads' &&
      leaf === 'messages' &&
      path.length === 5
        ? await this.authorizeMessages(
            actor,
            parse(uuid, channel),
            parse(uuid, task)
          )
        : undefined;
    if (typeof position !== 'number') reject(400, 'invalid_request');
    const result = this.store.tx(() => {
      this.store.admit(actor, Date.now());
      const limitArgs = [limit + 1, position];
      if (resource === 'delegations' && path.length === 1) {
        this.store.manager(actor);
        return this.store.rows(
          `SELECT ${delegationProjection} FROM delegations WHERE expires_at>? ORDER BY agent_key,user_id LIMIT ? OFFSET ?`,
          now,
          ...limitArgs
        );
      }
      if (resource === 'watchers' && path.length === 1) {
        return this.store
          .rows(
            `SELECT id,owner_key AS ownerKey,channel_id AS channelId,label_id AS labelId,
          event_mask AS eventMask,target_kind,target_ref,created_at AS createdAt FROM watchers w
          WHERE owner_key=? AND owner_user_id=? AND disabled_at IS NULL AND (channel_id IS NULL OR EXISTS(
            SELECT 1 FROM channels c WHERE c.id=w.channel_id AND (c.policy='standard' OR EXISTS(
              SELECT 1 FROM grants g WHERE g.channel_id=c.id AND g.principal=? AND (g.expires_at IS NULL OR g.expires_at>?)))))
          ORDER BY id LIMIT ? OFFSET ?`,
            actor.actor,
            actor.userId,
            actor.actor,
            now,
            ...limitArgs
          )
          .map(({ target_kind, target_ref, ...row }) => ({
            ...row,
            target: { kind: target_kind, ref: target_ref },
          }));
      }
      if (resource !== 'channels') reject(404, 'not_found');
      if (path.length === 1) {
        return this.store.rows(
          `SELECT id,slug,policy FROM channels c WHERE policy='standard' OR EXISTS(
          SELECT 1 FROM grants g WHERE g.channel_id=c.id AND g.principal=? AND (g.expires_at IS NULL OR g.expires_at>?))
          ORDER BY slug,id LIMIT ? OFFSET ?`,
          actor.actor,
          now,
          ...limitArgs
        );
      }
      const id = parse(uuid, channel);
      if (subject === 'grants' && path.length === 3) {
        this.store.manager(actor);
        this.store.channel(id);
        return this.store.rows(
          `SELECT ${grantProjection} FROM grants WHERE channel_id=? AND (expires_at IS NULL OR expires_at>?) ORDER BY principal LIMIT ? OFFSET ?`,
          id,
          now,
          ...limitArgs
        );
      }
      if (subject === 'threads' && leaf === 'messages' && path.length === 5) {
        this.store.enabled(messageGeneration);
        this.store.require(id, actor, 'reader', Date.now());
        return this.store
          .rows<{ body_json: string }>(
            `SELECT id,task_id AS taskId,channel_id AS channelId,
          author_key AS authorKey,schema,schema_version AS schemaVersion,body_json,created_at AS createdAt
          FROM messages WHERE channel_id=? AND task_id=? ORDER BY created_at,id LIMIT ? OFFSET ?`,
            id,
            parse(uuid, task),
            ...limitArgs
          )
          .map(({ body_json, ...row }) => ({
            ...row,
            body: JSON.parse(body_json),
          }));
      }
      if (subject === 'followups' && path.length === 3) {
        this.store.require(id, actor, 'operator', Date.now());
        const taskId = url.searchParams.get('taskId');
        if (taskId) parse(uuid, taskId);
        const generation = this.store.control().generation;
        return this.store
          .rows<NonNullable<ReturnType<Followups['get']>>>(
            'SELECT * FROM followups WHERE channel_id=? AND owner_key=? AND owner_user_id=? AND (? IS NULL OR task_id=?) ORDER BY id LIMIT ? OFFSET ?',
            id,
            actor.actor,
            actor.userId,
            taskId,
            taskId,
            ...limitArgs
          )
          .map((row) => followupView(row, generation));
      }
      reject(404, 'not_found');
    });
    return {
      items: result.slice(0, limit),
      nextCursor: await seal(result.length > limit ? position + limit : null),
    };
  }

  private async authorizeMessages(
    actor: Identity,
    channel: string,
    task: string
  ) {
    const generation = this.store.tx(() => {
      this.store.require(channel, actor, 'reader', Date.now());
      return this.store.enabled().generation;
    });
    const key = JSON.stringify([actor.userId, task, channel, generation]);
    const startedAt = Date.now();
    const cached = this.taskAccess.get(key);
    if (cached && cached.expiresAt > startedAt) {
      if (!cached.allowed) reject(404, 'not_found');
      return generation;
    }
    this.store.tx(() => this.store.charge(actor, 'task_read', startedAt));
    let allowed = true;
    try {
      await this.tasks.access(
        { ...actor, actor: `user:${actor.userId}`, agentActive: false },
        generation,
        channel,
        task
      );
    } catch (error) {
      if (!(error instanceof BoardError) || error.code !== 'not_found')
        throw error;
      allowed = false;
    }
    if (this.taskAccess.size >= 512) {
      const oldest = this.taskAccess.keys().next().value;
      if (oldest !== undefined) this.taskAccess.delete(oldest);
    }
    this.taskAccess.set(key, { expiresAt: startedAt + 60_000, allowed });
    if (!allowed) reject(404, 'not_found');
    return generation;
  }

  audit(actor: Identity, url: URL, now: number) {
    return this.store.tx(() => {
      this.store.manager(actor);
      const from = parse(seqSchema, url.searchParams.get('afterSeq') ?? '0');
      const limit = parse(limitSchema, url.searchParams.get('limit') ?? '25');
      const channel = url.searchParams.get('channelId');
      if (channel) parse(uuid, channel);
      const rows = this.store.rows<{
        seq: number;
        before_json: string | null;
        after_json: string | null;
      }>(
        `
        SELECT seq,at,actor,authenticated_user_id AS authenticatedUserId,action,channel_id AS channelId,
          target,before_json,after_json,request_id AS requestId FROM audit a WHERE seq>? AND (? IS NULL OR channel_id=?)
          AND (channel_id IS NULL OR action LIKE 'grant.%' OR EXISTS(
            SELECT 1 FROM channels c WHERE c.id=a.channel_id AND (c.policy='standard' OR EXISTS(
              SELECT 1 FROM grants g WHERE g.channel_id=c.id AND g.principal=? AND (g.expires_at IS NULL OR g.expires_at>?)))))
          ORDER BY seq LIMIT ?`,
        from,
        channel,
        channel,
        actor.actor,
        now,
        limit + 1
      );
      const items = rows
        .slice(0, limit)
        .map(({ before_json, after_json, ...row }) => ({
          ...row,
          before: before_json === null ? null : JSON.parse(before_json),
          after: after_json === null ? null : JSON.parse(after_json),
        }));
      return {
        items,
        nextAfterSeq: rows.length > limit ? items.at(-1)?.seq : null,
      };
    });
  }
}
