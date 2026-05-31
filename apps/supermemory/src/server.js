import crypto from 'node:crypto';
import postgres from 'postgres';

const PORT = Number(process.env.PORT || 8787);
const API_KEY = process.env.SUPERMEMORY_API_KEY?.trim() ?? '';
const DATABASE_URL =
  process.env.SUPERMEMORY_DATABASE_URL || process.env.DATABASE_URL || '';
const VECTOR_DIMENSIONS = 3072;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 500;

if (!DATABASE_URL) {
  throw new Error('SUPERMEMORY_DATABASE_URL or DATABASE_URL is required.');
}

const sql = postgres(DATABASE_URL, {
  idle_timeout: 20,
  max: Number(process.env.SUPERMEMORY_DATABASE_POOL_SIZE || 8),
  prepare: false,
});

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
}

function unauthorized() {
  return json({ error: 'Unauthorized' }, { status: 401 });
}

function getBearerToken(request) {
  const authorization = request.headers.get('authorization');
  if (authorization?.toLowerCase().startsWith('bearer ')) {
    return authorization.slice(7).trim();
  }

  return request.headers.get('x-api-key')?.trim() ?? '';
}

function assertAuthorized(request) {
  if (!API_KEY) return true;
  return getBearerToken(request) === API_KEY;
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function clampLimit(value, fallback = DEFAULT_LIMIT) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, MAX_LIMIT);
}

function vectorLiteral(embedding) {
  if (!Array.isArray(embedding) || embedding.length !== VECTOR_DIMENSIONS) {
    return null;
  }

  const values = [];
  for (const value of embedding) {
    const number = Number(value);
    if (!Number.isFinite(number)) return null;
    values.push(number);
  }

  return `[${values.join(',')}]`;
}

function normalizeMetadata(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
}

function metadataMatches(metadata, filter) {
  if (!filter) return true;

  if (Array.isArray(filter.AND)) {
    return filter.AND.every((entry) => metadataMatches(metadata, entry));
  }

  if (Array.isArray(filter.OR)) {
    return filter.OR.some((entry) => metadataMatches(metadata, entry));
  }

  if (filter.filterType !== 'metadata' || typeof filter.key !== 'string') {
    return true;
  }

  const actual = metadata?.[filter.key];
  if (Array.isArray(actual)) {
    return actual.includes(filter.value);
  }

  return actual === filter.value;
}

function filterRows(rows, filters) {
  if (!filters) return rows;
  return rows.filter((row) => metadataMatches(row.metadata, filters));
}

function normalizeOrder(value) {
  return String(value).toLowerCase() === 'asc' ? 'asc' : 'desc';
}

async function addMemory(body) {
  const content = typeof body?.content === 'string' ? body.content.trim() : '';
  const containerTag =
    typeof body?.containerTag === 'string' ? body.containerTag.trim() : '';
  const embedding = vectorLiteral(body?.embedding);

  if (!content || !containerTag || !embedding) {
    return json(
      {
        error:
          'containerTag, content, and 3072-dimensional embedding are required',
      },
      { status: 400 }
    );
  }

  const id =
    typeof body.id === 'string' && body.id.trim()
      ? body.id.trim()
      : crypto.randomUUID();
  const customId =
    typeof body.customId === 'string' && body.customId.trim()
      ? body.customId.trim()
      : null;
  const metadata = normalizeMetadata(body.metadata);

  const [row] = await sql`
    insert into public.memories (
      id,
      container_tag,
      custom_id,
      content,
      metadata,
      embedding,
      title
    )
    values (
      ${id},
      ${containerTag},
      ${customId},
      ${content},
      ${metadata},
      ${embedding}::extensions.halfvec,
      ${typeof metadata.memoryKey === 'string' ? metadata.memoryKey : null}
    )
    returning id, status
  `;

  return json({ id: row.id, status: row.status });
}

async function searchMemories(body) {
  const containerTag =
    typeof body?.containerTag === 'string' ? body.containerTag.trim() : '';
  const embedding = vectorLiteral(body?.embedding);
  if (!containerTag || !embedding) {
    return json(
      { error: 'containerTag and 3072-dimensional embedding are required' },
      { status: 400 }
    );
  }

  const limit = clampLimit(body.limit);
  const query = typeof body.q === 'string' ? body.q.trim() : '';
  const candidateLimit = Math.min(limit * 4, 500);

  const rows = await sql`
    with vector_search as (
      select
        id,
        content,
        metadata,
        updated_at,
        1 - (embedding <=> ${embedding}::extensions.halfvec) as similarity,
        row_number() over (order by embedding <=> ${embedding}::extensions.halfvec) as vector_rank
      from public.memories
      where container_tag = ${containerTag}
        and status = 'done'
      order by embedding <=> ${embedding}::extensions.halfvec
      limit ${candidateLimit}
    ),
    keyword_search as (
      select
        id,
        ts_rank_cd(fts, websearch_to_tsquery('english', ${query})) as keyword_score,
        row_number() over (
          order by ts_rank_cd(fts, websearch_to_tsquery('english', ${query})) desc
        ) as keyword_rank
      from public.memories
      where container_tag = ${containerTag}
        and status = 'done'
        and ${query} <> ''
        and fts @@ websearch_to_tsquery('english', ${query})
      order by ts_rank_cd(fts, websearch_to_tsquery('english', ${query})) desc
      limit ${candidateLimit}
    ),
    combined as (
      select
        coalesce(v.id, k.id) as id,
        coalesce(v.similarity, 0) as similarity,
        coalesce(k.keyword_score, 0) as keyword_score,
        coalesce(1.0 / (60 + v.vector_rank), 0) +
          coalesce(1.0 / (60 + k.keyword_rank), 0) as fused_score
      from vector_search v
      full outer join keyword_search k on k.id = v.id
    )
    select
      m.id,
      m.content,
      m.metadata,
      m.updated_at,
      c.similarity,
      c.keyword_score,
      c.fused_score
    from combined c
    join public.memories m on m.id = c.id
    order by c.fused_score desc, c.similarity desc, m.updated_at desc
    limit ${candidateLimit}
  `;

  const results = filterRows(rows, body.filters)
    .slice(0, limit)
    .map((row) => ({
      chunk: row.content,
      id: row.id,
      memory: row.content,
      metadata: row.metadata,
      similarity: Number(row.fused_score || row.similarity || 0),
      updatedAt: row.updated_at?.toISOString?.() ?? row.updated_at,
    }));

  return json({ results });
}

async function listMemories(body) {
  const containerTags = Array.isArray(body?.containerTags)
    ? body.containerTags.filter((tag) => typeof tag === 'string' && tag.trim())
    : [];
  if (containerTags.length === 0) {
    return json({ error: 'containerTags is required' }, { status: 400 });
  }

  const limit = clampLimit(body.limit, 100);
  const order = normalizeOrder(body.order);
  const rows =
    order === 'asc'
      ? await sql`
          select id, content, metadata, status, summary, title, updated_at
          from public.memories
          where container_tag in ${sql(containerTags)}
            and status = 'done'
          order by updated_at asc
          limit ${Math.min(limit * 3, 1000)}
        `
      : await sql`
          select id, content, metadata, status, summary, title, updated_at
          from public.memories
          where container_tag in ${sql(containerTags)}
            and status = 'done'
          order by updated_at desc
          limit ${Math.min(limit * 3, 1000)}
        `;

  const memories = filterRows(rows, body.filters)
    .slice(0, limit)
    .map((row) => ({
      content: body.includeContent === false ? null : row.content,
      id: row.id,
      metadata: row.metadata,
      status: row.status,
      summary: row.summary,
      title: row.title,
      updatedAt: row.updated_at?.toISOString?.() ?? row.updated_at,
    }));

  return json({ memories });
}

async function forgetMemory(body) {
  const containerTag =
    typeof body?.containerTag === 'string' ? body.containerTag.trim() : '';
  const id = typeof body?.id === 'string' ? body.id.trim() : '';
  if (!containerTag || !id) {
    return json({ error: 'containerTag and id are required' }, { status: 400 });
  }

  const [row] = await sql`
    update public.memories
    set
      status = 'forgotten',
      forgotten_at = now(),
      forget_reason = ${typeof body.reason === 'string' ? body.reason : null}
    where id = ${id}
      and container_tag = ${containerTag}
      and status = 'done'
    returning id
  `;

  return json({ forgotten: !!row, id });
}

async function health() {
  await sql`select 1`;
  return json({
    ok: true,
    service: 'tuturuuu-memory',
    vectorDimensions: VECTOR_DIMENSIONS,
  });
}

async function route(request) {
  const url = new URL(request.url);

  if (request.method === 'GET' && url.pathname === '/health') {
    return health();
  }

  if (!assertAuthorized(request)) {
    return unauthorized();
  }

  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  const body = await readJson(request);
  if (!body) return json({ error: 'Invalid JSON body' }, { status: 400 });

  if (url.pathname === '/v1/memories') return addMemory(body);
  if (url.pathname === '/v1/search') return searchMemories(body);
  if (url.pathname === '/v1/documents/list') return listMemories(body);
  if (url.pathname === '/v1/memories/forget') return forgetMemory(body);

  return json({ error: 'Not found' }, { status: 404 });
}

Bun.serve({
  fetch: (request) =>
    route(request).catch((error) =>
      json(
        {
          error:
            error instanceof Error ? error.message : 'Internal server error',
        },
        { status: 500 }
      )
    ),
  hostname: '0.0.0.0',
  port: PORT,
});

process.stdout.write(`Tuturuuu memory service listening on 0.0.0.0:${PORT}\n`);
