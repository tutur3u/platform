import type { MemoryDatabase } from './database';
import type { Caller } from './protocol';

export async function advanceRevision(sql: MemoryDatabase, caller: Caller) {
  const [gate] = await sql<{ revision: string }[]>`
    update memory_worker.admission set revision = revision + 1
    where caller = ${caller}
    returning revision::text
  `;
  if (!gate) throw new Error('Missing memory admission row');
  return gate.revision;
}

export async function hasReplacement(
  sql: MemoryDatabase,
  caller: Caller,
  containerTag: string,
  replacement: { customId: string; revision: string },
  excludedId?: string
) {
  const [memory] = await sql`
    select id from public.memories
    where worker_caller = ${caller} and container_tag = ${containerTag}
      and custom_id = ${replacement.customId} and status = 'done'
      and worker_revision::text = ${replacement.revision}
      and id <> ${excludedId ?? ''}
  `;
  return !!memory;
}
