import { z } from 'zod';
import {
  key,
  ms,
  principal,
  role,
  slug,
  uuid,
  type Identity,
} from './contracts';
import { reject, type Store } from './store';

export function parse<T>(
  schema: z.ZodType<T>,
  value: unknown,
  code = 'invalid_request'
): T {
  const result = schema.safeParse(value);
  if (!result.success) reject(code === 'invalid_request' ? 400 : 422, code);
  return result.data;
}

export const registration = z
  .strictObject({
    projectId: uuid,
    slug,
    policy: z.enum(['standard', 'restricted']),
  })
  .refine(
    (row) =>
      row.policy === 'restricted' ||
      (row.slug !== 'security' && !row.slug.startsWith('security/'))
  );
const stopInput = z.strictObject({
  stopped: z.boolean(),
  expectedGeneration: ms,
});
const grantInput = z.strictObject({ role, expiresAt: ms.optional() });
const delegationInput = z.strictObject({ expiresAt: ms });

export function stopView(store: Store) {
  const control = store.control();
  return { stopped: !!control.stopped, generation: control.generation };
}

export function changeStop(
  store: Store,
  actor: Identity,
  body: unknown,
  requestId: string
) {
  store.manager(actor, actor.issuedAt);
  const input = parse(stopInput, body);
  const before = stopView(store);
  if (before.generation !== input.expectedGeneration)
    reject(409, 'state_conflict');
  if (!input.stopped && store.count('audit') >= 239_999)
    reject(503, 'board_stopped');
  if (before.stopped === input.stopped) return before;
  store.run(
    'UPDATE control SET stopped=?,generation=generation+1 WHERE id=1',
    Number(input.stopped)
  );
  const after = stopView(store);
  store.audit(
    actor,
    'board.stop_changed',
    'board',
    null,
    before,
    after,
    requestId
  );
  return after;
}

export function registerChannel(
  store: Store,
  actor: Identity,
  input: z.infer<typeof registration>,
  requestId: string,
  now: number
) {
  store.manager(actor, actor.issuedAt);
  store.enabled();
  if (
    store.one(
      'SELECT 1 FROM channels WHERE id=? OR slug=?',
      input.projectId,
      input.slug
    )
  )
    reject(409, 'state_conflict');
  store.capacity('channels', 256);
  const row = { id: input.projectId, slug: input.slug, policy: input.policy };
  store.run(
    'INSERT INTO channels VALUES(?,?,?,?,?)',
    row.id,
    row.slug,
    row.policy,
    now,
    actor.actor
  );
  store.audit(
    actor,
    'channel.registered',
    row.id,
    row.id,
    null,
    row,
    requestId
  );
  return row;
}

export const grantProjection =
  'channel_id AS channelId,principal,role,granted_by AS grantedBy,granted_at AS grantedAt,expires_at AS expiresAt';

export function changeGrant(
  store: Store,
  actor: Identity,
  channel: string,
  target: string,
  body: unknown,
  requestId: string,
  now: number,
  remove: boolean
) {
  store.manager(actor, actor.issuedAt);
  store.channel(channel);
  const subject = parse(principal, target);
  const before = store.one(
    `SELECT ${grantProjection} FROM grants WHERE channel_id=? AND principal=?`,
    channel,
    subject
  );
  if (remove) {
    if (before) {
      store.run(
        'DELETE FROM grants WHERE channel_id=? AND principal=?',
        channel,
        subject
      );
      store.audit(
        actor,
        'grant.revoked',
        subject,
        channel,
        before,
        null,
        requestId
      );
    }
    return { revoked: !!before };
  }
  store.enabled();
  const input = parse(grantInput, body);
  if (input.expiresAt !== undefined && input.expiresAt <= now)
    reject(422, 'invalid_reference');
  const total = store.one<{ count: number }>(
    'SELECT COUNT(*) AS count FROM grants WHERE channel_id=?',
    channel
  );
  if (!before && (total?.count ?? 0) >= 256) reject(429, 'budget_exhausted');
  const row = {
    channelId: channel,
    principal: subject,
    role: input.role,
    grantedBy: actor.actor,
    grantedAt: now,
    expiresAt: input.expiresAt ?? null,
  };
  store.run(
    'INSERT OR REPLACE INTO grants VALUES(?,?,?,?,?,?)',
    channel,
    subject,
    row.role,
    row.grantedBy,
    now,
    row.expiresAt
  );
  store.audit(actor, 'grant.changed', subject, channel, before, row, requestId);
  return row;
}

export const delegationProjection =
  'agent_key AS agentKey,user_id AS userId,granted_by AS grantedBy,granted_at AS grantedAt,expires_at AS expiresAt';

export function changeDelegation(
  store: Store,
  actor: Identity,
  agent: string,
  user: string,
  body: unknown,
  requestId: string,
  now: number,
  remove: boolean
) {
  store.manager(actor, actor.issuedAt);
  const agentKey = parse(key, agent);
  const userId = parse(uuid, user);
  const subject = `${agentKey}:${userId}`;
  const before = store.one(
    `SELECT ${delegationProjection} FROM delegations WHERE agent_key=? AND user_id=?`,
    agentKey,
    userId
  );
  if (remove) {
    if (before) {
      store.run(
        'DELETE FROM delegations WHERE agent_key=? AND user_id=?',
        agentKey,
        userId
      );
      store.audit(
        actor,
        'delegation.revoked',
        subject,
        null,
        before,
        null,
        requestId
      );
    }
    return { revoked: !!before };
  }
  store.enabled();
  const { expiresAt } = parse(delegationInput, body);
  if (expiresAt <= now || expiresAt > now + 30 * 86_400_000)
    reject(422, 'invalid_reference');
  if (!before) store.capacity('delegations', 4096);
  const row = {
    agentKey,
    userId,
    grantedBy: actor.actor,
    grantedAt: now,
    expiresAt,
  };
  store.run(
    'INSERT OR REPLACE INTO delegations VALUES(?,?,?,?,?)',
    agentKey,
    userId,
    actor.actor,
    now,
    expiresAt
  );
  store.audit(
    actor,
    'delegation.changed',
    subject,
    null,
    before,
    row,
    requestId
  );
  return row;
}
