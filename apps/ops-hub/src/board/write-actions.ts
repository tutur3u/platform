import { parse } from './admin';
import { encode, hash, type authorize } from './assertion';
import { messages, watcher } from './contracts';
import type { Leases } from './leases';
import { reject, type Store } from './store';
export type Input = Awaited<ReturnType<typeof authorize>>;
export type Replay = {
  fingerprint: string;
  status: number;
  response_json: string;
};

export async function replay(
  store: Store,
  leases: Leases,
  input: Input,
  row: Replay,
  claim: boolean
) {
  const response = JSON.parse(row.response_json);
  const claimed = claim ? response.lease : null;
  if (!claimed) return { status: row.status, response };
  const { actor, idempotency } = input;
  const token = await leases.token(
    actor,
    claimed.taskId,
    idempotency,
    claimed.fence
  );
  const tokenHash = await hash(encode(token));
  store.tx(() => {
    const now = Date.now();
    store.require(claimed.channelId, actor, 'operator', now);
    const live = leases.get(claimed.taskId);
    if (
      !live ||
      live.fence !== claimed.fence ||
      live.holder_user_id !== actor.userId ||
      live.holder_key !== actor.actor ||
      live.expires_at <= now ||
      live.token_hash !== tokenHash
    )
      reject(409, 'lease_lost');
  });
  return { status: row.status, response: { lease: { ...claimed, token } } };
}

export function post(
  store: Store,
  input: Input,
  channelId: string,
  taskId: string,
  now: number
) {
  const { actor, json, idempotency } = input;
  const message = parse(messages, json, 'invalid_schema');
  if (encode(JSON.stringify(message.body)).byteLength > 8192)
    reject(413, 'payload_too_large');
  const channel = store.channel(channelId);
  if (message.schema === 'security_finding' && channel.policy !== 'restricted')
    reject(422, 'invalid_schema');
  if (
    message.schema === 'handoff' &&
    actor.actor !== `agent:${message.body.fromKey}`
  )
    reject(422, 'invalid_reference');
  if (
    message.schema === 'decision' &&
    message.body.supersedes &&
    !store.one(
      'SELECT 1 FROM messages WHERE id=? AND channel_id=? AND task_id=?',
      message.body.supersedes,
      channelId,
      taskId
    )
  ) {
    reject(422, 'invalid_reference');
  }
  store.charge(actor, 'message', now);
  store.capacity('messages', 100_000);
  const row = {
    id: crypto.randomUUID(),
    taskId,
    channelId,
    authorKey: actor.actor,
    ...message,
    createdAt: now,
  };
  store.run(
    'INSERT INTO messages VALUES(?,?,?,?,?,?,?,?)',
    row.id,
    taskId,
    channelId,
    row.authorKey,
    row.schema,
    row.schemaVersion,
    JSON.stringify(row.body),
    now
  );
  store.audit(
    actor,
    'message.posted',
    row.id,
    channelId,
    null,
    { taskId, schema: row.schema, schemaVersion: row.schemaVersion },
    idempotency
  );
  return row;
}

export function watch(store: Store, input: Input, now: number) {
  const { actor, json, idempotency } = input;
  const watch = parse(watcher, json);
  if (watch.target.kind === 't3_thread') reject(503, 'adapter_unavailable');
  store.charge(actor, 'watcher', now);
  const total = store.one<{ total: number; owned: number | null }>(
    'SELECT COUNT(*) AS total, SUM(owner_key=?) AS owned FROM watchers WHERE disabled_at IS NULL',
    actor.actor
  );
  if ((total?.total ?? 0) >= 256 || (total?.owned ?? 0) >= 16)
    reject(429, 'budget_exhausted');
  const row = {
    ...watch,
    id: crypto.randomUUID(),
    ownerKey: actor.actor,
    createdAt: now,
  };
  store.run(
    'INSERT INTO watchers VALUES(?,?,?,?,?,?,?,?,?,NULL)',
    row.id,
    actor.actor,
    actor.userId,
    watch.channelId ?? null,
    watch.labelId ?? null,
    watch.eventMask,
    watch.target.kind,
    watch.target.ref,
    now
  );
  store.audit(
    actor,
    'watcher.created',
    row.id,
    watch.channelId ?? null,
    null,
    { eventMask: row.eventMask, targetKind: row.target.kind },
    idempotency
  );
  return row;
}
