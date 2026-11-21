import type { MemoryDatabase } from './database';
import { advanceRevision, hasReplacement } from './mutations';
import { type Caller, type Command, MAX_PURGE_BATCH } from './protocol';

type Purge = Extract<Command, { operation: 'purge' }>['body'];
type SelectedMemory = { id: string; customId: string; containerTag: string };
type Receipt = {
  purged: string[];
  retained: { customId: string; reason: 'unavailable' }[];
  revision: string;
  complete: boolean;
};

async function digestRequest(body: Purge, customIds: string[]) {
  const data = JSON.stringify([
    body.containerTag,
    customIds,
    body.customIdPrefix ?? null,
    body.expectedRevision,
    body.replacement?.customId ?? null,
    body.replacement?.revision ?? null,
  ]);
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(data)
  );
  return Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, '0')
  ).join('');
}

async function selectPurgeRows(
  sql: MemoryDatabase,
  caller: Caller,
  body: Purge,
  customIds: string[]
) {
  if (customIds.length > 0) {
    return sql<SelectedMemory[]>`
      select id, custom_id as "customId", container_tag as "containerTag"
      from public.memories
      where worker_caller = ${caller} and custom_id in ${sql(customIds)}
    `;
  }
  const selector = body.customIdPrefix
    ? sql`and starts_with(custom_id, ${body.customIdPrefix})`
    : sql``;
  return sql<SelectedMemory[]>`
    select id, custom_id as "customId", container_tag as "containerTag"
    from public.memories
    where worker_caller = ${caller} and container_tag = ${body.containerTag}
      ${selector}
    order by custom_id
    limit ${MAX_PURGE_BATCH + 1}
  `;
}

export async function purgeMemories(
  sql: MemoryDatabase,
  caller: Caller,
  snapshotRevision: string,
  body: Purge
) {
  const customIds = [...new Set(body.customIds ?? [])].sort();
  const requestDigest = await digestRequest(body, customIds);
  const [prior] = await sql<{ requestDigest: string; receipt: Receipt }[]>`
    select request_digest as "requestDigest", receipt from memory_worker.purge_receipts
    where caller = ${caller} and request_id = ${body.requestId}::uuid
  `;
  if (prior)
    return prior.requestDigest === requestDigest
      ? { body: prior.receipt }
      : { status: 409, body: { error: 'request_id_conflict' } };
  if (snapshotRevision !== body.expectedRevision)
    return { status: 409, body: { error: 'revision_conflict' } };

  const fullTag = !body.customIdPrefix && customIds.length === 0;
  if (caller === 'assistant') {
    const selector =
      customIds.length > 0
        ? sql`and custom_id in ${sql(customIds)}`
        : body.customIdPrefix
          ? sql`and starts_with(custom_id, ${body.customIdPrefix})`
          : sql``;
    const [legacy] = await sql`
      select 1 from public.memories where worker_caller is null
        and container_tag = ${body.containerTag} ${selector}
      limit 1
    `;
    if (legacy)
      return {
        status: 409,
        body: { error: 'legacy_rows_require_reconciliation' },
      };
  }
  if (
    body.replacement &&
    (fullTag ||
      customIds.includes(body.replacement.customId) ||
      (body.customIdPrefix &&
        body.replacement.customId.startsWith(body.customIdPrefix)) ||
      !(await hasReplacement(sql, caller, body.containerTag, body.replacement)))
  )
    return { status: 409, body: { error: 'replacement_unconfirmed' } };

  const selected = await selectPurgeRows(sql, caller, body, customIds);
  const unavailable = new Set(
    selected
      .filter((row) => row.containerTag !== body.containerTag)
      .map((row) => row.customId)
  );
  const eligible = selected
    .filter((row) => row.containerTag === body.containerTag)
    .slice(0, MAX_PURGE_BATCH);
  const candidates =
    customIds.length === 0
      ? eligible.map((row) => row.customId)
      : customIds.filter((customId) => !unavailable.has(customId));

  if (fullTag) {
    await sql`
      insert into memory_worker.retired_tags (caller, container_tag)
      values (${caller}, ${body.containerTag}) on conflict do nothing
    `;
  }
  if (candidates.length > 0) {
    await sql`
      insert into memory_worker.retired_ids
      ${sql(candidates.map((custom_id) => ({ caller, custom_id })))}
      on conflict do nothing
    `;
  }
  if (eligible.length > 0) {
    await sql`
      delete from public.memories
      where worker_caller = ${caller} and container_tag = ${body.containerTag}
        and id in ${sql(eligible.map((row) => row.id))}
    `;
  }

  const receipt: Receipt = {
    purged: candidates,
    retained: [...unavailable].map((customId) => ({
      customId,
      reason: 'unavailable',
    })),
    revision: await advanceRevision(sql, caller),
    complete: selected.length <= MAX_PURGE_BATCH && unavailable.size === 0,
  };
  await sql`
    insert into memory_worker.purge_receipts (caller, request_id, request_digest, receipt)
    values (${caller}, ${body.requestId}::uuid, ${requestDigest}, ${sql.json(receipt)})
  `;
  return { body: receipt };
}
