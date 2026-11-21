import type { MemoryDatabase } from './database';
import { advanceRevision, hasReplacement } from './mutations';
import {
  type Caller,
  type Command,
  matchesFilter,
  type StoreResponse,
} from './protocol';
import { purgeMemories } from './purge';

type Operation<T extends Command['operation']> = Extract<
  Command,
  { operation: T }
>['body'];

const NOT_FOUND = { status: 404, body: { error: 'not_found' } };
const CONFLICT = { status: 409, body: { error: 'revision_conflict' } };
const MAX_CANDIDATES = 500;

function visible(sql: MemoryDatabase, caller: Caller) {
  return sql`
    (worker_caller = ${caller} or (worker_caller is null and ${caller} = 'assistant'))
    and not exists (
      select 1 from memory_worker.retired_tags retired
      where retired.caller = ${caller} and retired.container_tag = memories.container_tag
    )
  `;
}

function scope(sql: MemoryDatabase, caller: Caller, containerTag: string) {
  return sql`container_tag = ${containerTag} and ${visible(sql, caller)}`;
}

function editScope(
  sql: MemoryDatabase,
  caller: Caller,
  body: Operation<'read'>
) {
  return sql`
    ${scope(sql, caller, body.containerTag)} and id = ${body.id}
    and status = 'done'
    and (${caller} = 'people-registry' or (
      metadata ->> 'userId' = ${body.userId ?? null}
      and metadata ->> 'wsId' = ${body.wsId ?? null}
      and metadata ->> 'product' = ${body.product ?? null}
    ))
  `;
}

async function addMemory(
  sql: MemoryDatabase,
  caller: Caller,
  body: Operation<'add'>
) {
  const [blocked] = await sql<{ retired: boolean }[]>`
    select exists (
      select 1 from memory_worker.retired_ids
      where caller = ${caller} and custom_id = ${body.customId}
    ) or exists (
      select 1 from memory_worker.retired_tags
      where caller = ${caller} and container_tag = ${body.containerTag}
    ) as retired
  `;
  if (blocked?.retired)
    return { status: 409, body: { error: 'memory_retired' } };

  const [existing] = await sql<
    { id: string; status: string; revision: string; containerTag: string }[]
  >`
    select id, status, container_tag as "containerTag", worker_revision::text as revision
    from public.memories where worker_caller = ${caller} and custom_id = ${body.customId}
  `;
  if (existing) {
    const { containerTag, ...receipt } = existing;
    return containerTag === body.containerTag
      ? { body: receipt }
      : { status: 409, body: { error: 'custom_id_conflict' } };
  }

  const revision = await advanceRevision(sql, caller);
  const id = crypto.randomUUID();
  const title =
    typeof body.metadata.memoryKey === 'string'
      ? body.metadata.memoryKey
      : null;
  await sql`
    insert into public.memories (
      id, container_tag, custom_id, content, metadata, embedding, title,
      worker_caller, worker_revision
    ) values (
      ${id}, ${body.containerTag}, ${body.customId}, ${body.content},
      ${sql.json(body.metadata)}, ${`[${body.embedding.join(',')}]`}::extensions.halfvec,
      ${title}, ${caller}, ${revision}::bigint
    )
  `;
  return { body: { id, status: 'done', revision } };
}

async function readMemory(
  sql: MemoryDatabase,
  caller: Caller,
  command: Extract<Command, { operation: 'read' | 'read_by_custom_id' }>,
  revision: string
) {
  const condition =
    command.operation === 'read'
      ? editScope(sql, caller, command.body)
      : sql`worker_caller = ${caller} and ${scope(sql, caller, command.body.containerTag)}
      and custom_id = ${command.body.customId} and status = 'done'`;
  const [memory] = await sql`
    select id, content, metadata, status, custom_id as "customId",
      worker_revision::text as revision
    from public.memories where ${condition}
  `;
  return memory ? { body: { memory, snapshotRevision: revision } } : NOT_FOUND;
}

async function updateMemory(
  sql: MemoryDatabase,
  caller: Caller,
  body: Operation<'update'>
) {
  const condition = editScope(sql, caller, body);
  const [current] = await sql<{ revision: string }[]>`
    select worker_revision::text as revision from public.memories where ${condition}
    for update
  `;
  if (current?.revision !== body.revision) return CONFLICT;

  const revision = await advanceRevision(sql, caller);
  const [memory] = await sql`
    update public.memories set content = ${body.content},
      embedding = ${`[${body.embedding.join(',')}]`}::extensions.halfvec,
      summary = null, worker_revision = ${revision}::bigint
    where ${condition} and worker_revision::text = ${body.revision}
    returning id, content, metadata, status, custom_id as "customId",
      worker_revision::text as revision
  `;
  return memory ? { body: { updated: true, memory } } : CONFLICT;
}

async function forgetMemory(
  sql: MemoryDatabase,
  caller: Caller,
  body: Operation<'forget'>
) {
  const condition = scope(sql, caller, body.containerTag);
  const [current] = await sql<{ status: string; revision: string }[]>`
    select status, worker_revision::text as revision
    from public.memories where ${condition} and id = ${body.id}
    for update
  `;
  if (!current) return { body: { forgotten: false, id: body.id } };
  if (current.status === 'forgotten')
    return { body: { forgotten: true, id: body.id } };
  if (body.revision !== undefined && current.revision !== body.revision)
    return CONFLICT;
  if (
    body.replacement &&
    !(await hasReplacement(
      sql,
      caller,
      body.containerTag,
      body.replacement,
      body.id
    ))
  )
    return { status: 409, body: { error: 'replacement_unconfirmed' } };
  const revision = await advanceRevision(sql, caller);
  await sql`
    update public.memories set status = 'forgotten', forgotten_at = now(),
      forget_reason = ${body.reason ?? null}, worker_revision = ${revision}::bigint
    where ${condition} and id = ${body.id}
  `;
  return { body: { forgotten: true, id: body.id, revision } };
}

async function listMemories(
  sql: MemoryDatabase,
  caller: Caller,
  body: Operation<'list'>,
  revision: string
) {
  const direction = body.order === 'asc' ? sql`asc` : sql`desc`;
  const rows = await sql`
    select id, case when ${body.includeContent} then content end as content,
      metadata, status, summary, title, updated_at as "updatedAt",
      custom_id as "customId", worker_revision::text as revision
    from public.memories where container_tag in ${sql(body.containerTags)}
      and ${visible(sql, caller)}
      and status = 'done'
    order by updated_at ${direction}, id
    limit ${Math.min(body.limit * 3, 1000)}
  `;
  return {
    body: {
      memories: rows
        .filter((row) => matchesFilter(row.metadata, body.filters))
        .slice(0, body.limit),
      revision,
    },
  };
}

async function searchMemories(
  sql: MemoryDatabase,
  caller: Caller,
  body: Operation<'search'>
) {
  const condition = scope(sql, caller, body.containerTag);
  const vector = `[${body.embedding.join(',')}]`;
  const candidates = Math.min(body.limit * 4, MAX_CANDIDATES);
  const rows = await sql`
    with vectors as (
      select id, embedding operator(extensions.<=>) ${vector}::extensions.halfvec as distance
      from public.memories where ${condition} and status = 'done'
      order by embedding operator(extensions.<=>) ${vector}::extensions.halfvec
      limit ${candidates}
    ), keywords as (
      select id, ts_rank_cd(fts, websearch_to_tsquery('english', ${body.q})) as score
      from public.memories where ${condition} and status = 'done'
        and ${body.q} <> '' and fts @@ websearch_to_tsquery('english', ${body.q})
      order by score desc, id
      limit ${candidates}
    ), vector_ranks as (
      select id, row_number() over (order by distance, id) as rank from vectors
    ), keyword_ranks as (
      select id, row_number() over (order by score desc, id) as rank from keywords
    ), ranked as (
      select coalesce(v.id, k.id) as id,
        coalesce(1.0 / (60 + v.rank), 0) + coalesce(1.0 / (60 + k.rank), 0) as score
      from vector_ranks v full join keyword_ranks k using (id)
    )
    select m.id, m.content as chunk, m.content as memory, m.metadata,
      m.worker_revision::text as revision,
      m.updated_at as "updatedAt", r.score::float8 as similarity
    from ranked r join public.memories m on m.id = r.id
    order by r.score desc, m.updated_at desc, m.id
    limit ${candidates}
  `;
  return {
    body: {
      results: rows
        .filter((row) => matchesFilter(row.metadata, body.filters))
        .slice(0, body.limit),
    },
  };
}

export function execute(
  sql: MemoryDatabase,
  caller: Caller,
  revision: string,
  command: Command
): Promise<StoreResponse> {
  switch (command.operation) {
    case 'add':
      return addMemory(sql, caller, command.body);
    case 'read':
    case 'read_by_custom_id':
      return readMemory(sql, caller, command, revision);
    case 'update':
      return updateMemory(sql, caller, command.body);
    case 'forget':
      return forgetMemory(sql, caller, command.body);
    case 'list':
      return listMemories(sql, caller, command.body, revision);
    case 'search':
      return searchMemories(sql, caller, command.body);
    case 'purge':
      return purgeMemories(sql, caller, revision, command.body);
  }
}
