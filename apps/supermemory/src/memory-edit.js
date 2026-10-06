// Opaque concurrency revisions are derived in PostgreSQL, before JavaScript can
// round the timestamp. They are not authorization tokens: every query also
// verifies the complete owner/workspace/product scope and active status.
// Tuple versions fence same-content updates even inside one transaction.
// Table maintenance may invalidate a revision and require a fresh scoped read.
const REVISION_PATTERN = /^v1:[a-f0-9]{32}$/;
const MAX_CONTENT_LENGTH = 20000;

export function readEditScope(body) {
  const fields = ['id', 'containerTag', 'userId', 'wsId', 'product'];
  if (
    !fields.every((key) => typeof body?.[key] === 'string' && body[key].trim())
  ) {
    return null;
  }
  return Object.fromEntries(fields.map((key) => [key, body[key].trim()]));
}

export function validEdit(body) {
  return (
    typeof body?.content === 'string' &&
    !!body.content.trim() &&
    body.content.length <= MAX_CONTENT_LENGTH &&
    typeof body.revision === 'string' &&
    REVISION_PATTERN.test(body.revision) &&
    Array.isArray(body.embedding) &&
    body.embedding.length === 3072 &&
    body.embedding.every(
      (value) => typeof value === 'number' && Number.isFinite(value)
    )
  );
}

export async function readEditableMemory(sql, scope) {
  const [row] = await sql`
    select id, content, metadata, custom_id as "customId", status,
      'v1:' || md5(jsonb_build_array(id,
        extract(epoch from updated_at)::text, content, metadata, ctid::text)::text) as revision
    from public.memories
    where id = ${scope.id}
      and container_tag = ${scope.containerTag}
      and metadata ->> 'userId' = ${scope.userId}
      and metadata ->> 'wsId' = ${scope.wsId}
      and metadata ->> 'product' = ${scope.product}
      and status = 'done'
  `;
  return row ?? null;
}

export async function updateEditableMemory(sql, scope, body) {
  const vector = `[${body.embedding.join(',')}]`;
  const [row] = await sql`
    update public.memories
    set content = ${body.content.trim()},
      embedding = ${vector}::extensions.halfvec,
      summary = null
    where id = ${scope.id}
      and container_tag = ${scope.containerTag}
      and metadata ->> 'userId' = ${scope.userId}
      and metadata ->> 'wsId' = ${scope.wsId}
      and metadata ->> 'product' = ${scope.product}
      and status = 'done'
      and 'v1:' || md5(jsonb_build_array(id,
        extract(epoch from updated_at)::text, content, metadata, ctid::text)::text) = ${body.revision}
    returning id, content, metadata, custom_id as "customId", status,
      'v1:' || md5(jsonb_build_array(id,
        extract(epoch from updated_at)::text, content, metadata, ctid::text)::text) as revision
  `;
  return row ?? null;
}
