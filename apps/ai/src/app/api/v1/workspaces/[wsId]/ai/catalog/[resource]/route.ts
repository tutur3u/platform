import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { NextRequest } from 'next/server';
import { connection } from 'next/server';
import { authorizeAiStudioWorkspaceRequest } from '@/lib/session-api';

const RESOURCES = new Set(['agents', 'datasets', 'prompts']);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CatalogResource = 'agents' | 'datasets' | 'prompts';
type Cursor = { id: string; updatedAt: string };

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ resource: string; wsId: string }> }
) {
  await connection();
  const { resource: rawResource, wsId } = await params;
  if (!RESOURCES.has(rawResource)) {
    return Response.json(
      { error: 'Unknown AI Studio resource' },
      { status: 404 }
    );
  }
  const resource = rawResource as CatalogResource;
  const auth = await authorizeAiStudioWorkspaceRequest(wsId, 'use_ai_studio');
  if (!auth.ok) return auth.response;

  const limit = parseLimit(request.nextUrl.searchParams.get('limit'));
  const rawCursor = request.nextUrl.searchParams.get('cursor');
  const cursor = parseCursor(rawCursor);
  if (rawCursor && !cursor) {
    return Response.json({ error: 'Invalid catalog cursor' }, { status: 400 });
  }

  const { data, error } = await listCatalogItems({
    cursor,
    limit: limit + 1,
    resource,
    sbAdmin: auth.sbAdmin,
    workspaceId: auth.workspace.id,
  });
  if (error) {
    console.error('AI Studio catalog query failed', {
      code: error.code,
      resource,
      workspaceId: auth.workspace.id,
    });
    return Response.json(
      { error: 'AI Studio catalog unavailable' },
      { status: 500 }
    );
  }

  const page = (data ?? []).slice(0, limit);
  const last = page.at(-1);

  return Response.json(
    {
      items: page.map((item) => ({
        description: item.description,
        id: item.id,
        name: item.name,
        slug: 'slug' in item ? item.slug : null,
        updatedAt: item.updated_at,
        version: 'latest_version' in item ? item.latest_version : null,
      })),
      nextCursor:
        (data?.length ?? 0) > limit && last
          ? `${last.updated_at}~${last.id}`
          : null,
    },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}

function listCatalogItems({
  cursor,
  limit,
  resource,
  sbAdmin,
  workspaceId,
}: {
  cursor: Cursor | null;
  limit: number;
  resource: CatalogResource;
  sbAdmin: TypedSupabaseClient;
  workspaceId: string;
}) {
  if (resource === 'datasets') {
    let query = sbAdmin
      .schema('private')
      .from('ai_studio_datasets')
      .select('id, name, description, updated_at')
      .eq('ws_id', workspaceId)
      .order('updated_at', { ascending: false })
      .order('id', { ascending: false });
    if (cursor) query = applyCursor(query, cursor);
    return query.limit(limit);
  }

  const table =
    resource === 'agents' ? 'ai_studio_agents' : 'ai_studio_prompts';
  let query = sbAdmin
    .schema('private')
    .from(table)
    .select('id, name, slug, description, latest_version, updated_at')
    .eq('ws_id', workspaceId)
    .is('archived_at', null)
    .order('updated_at', { ascending: false })
    .order('id', { ascending: false });
  if (cursor) query = applyCursor(query, cursor);
  return query.limit(limit);
}

function applyCursor<T extends { or: (filters: string) => T }>(
  query: T,
  cursor: Cursor
) {
  return query.or(
    `updated_at.lt.${cursor.updatedAt},and(updated_at.eq.${cursor.updatedAt},id.lt.${cursor.id})`
  );
}

function parseCursor(value: string | null): Cursor | null {
  if (!value) return null;
  const separator = value.lastIndexOf('~');
  if (separator < 1) return null;
  const updatedAt = value.slice(0, separator);
  const id = value.slice(separator + 1);
  if (Number.isNaN(new Date(updatedAt).getTime()) || !UUID_PATTERN.test(id)) {
    return null;
  }
  return { id, updatedAt };
}

function parseLimit(value: string | null) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 100) : 50;
}
