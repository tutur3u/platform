import {
  batchFetch,
  batchUpsert,
  createFetchResponse,
  createMigrationResponse,
  requireDevMode,
} from '../batch-upsert';

export async function GET(req: Request) {
  const devModeError = requireDevMode();
  if (devModeError) return devModeError;

  const url = new URL(req.url);
  const wsId = url.searchParams.get('ws_id');
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);
  const limit = parseInt(url.searchParams.get('limit') || '500', 10);

  if (!wsId) {
    return Response.json({ error: 'ws_id is required' }, { status: 400 });
  }

  const result = await batchFetch({
    table: 'workspace_user_group_session_tag_links',
    wsId,
    offset,
    limit,
    schema: 'private',
  });
  return createFetchResponse(result, 'workspace-user-group-session-tag-links');
}

export async function PUT(req: Request) {
  const devModeError = requireDevMode();
  if (devModeError) return devModeError;

  const json = await req.json();
  const result = await batchUpsert({
    table: 'workspace_user_group_session_tag_links',
    data: json?.data || [],
    onConflict: 'session_id,tag_id',
    schema: 'private',
  });
  return createMigrationResponse(
    result,
    'workspace-user-group-session-tag-links'
  );
}
