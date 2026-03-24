import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  batchFetch,
  batchUpsert,
  createFetchResponse,
  createMigrationResponse,
  requireDevMode,
} from '../batch-upsert';

const IN_QUERY_BATCH_SIZE = 500;

interface QueueRow {
  post_id?: string;
  [key: string]: unknown;
}

async function getExistingPostIds(postIds: string[]): Promise<Set<string>> {
  const supabase = await createAdminClient({ noCookie: true });
  const existingPostIds = new Set<string>();

  for (let i = 0; i < postIds.length; i += IN_QUERY_BATCH_SIZE) {
    const batch = postIds.slice(i, i + IN_QUERY_BATCH_SIZE);
    const { data, error } = await supabase
      .from('user_group_posts')
      .select('id')
      .in('id', batch);

    if (error) {
      throw new Error(error.message);
    }

    for (const row of data ?? []) {
      if (row.id) {
        existingPostIds.add(row.id);
      }
    }
  }

  return existingPostIds;
}

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
    table: 'post_email_queue',
    wsId,
    offset,
    limit,
  });
  return createFetchResponse(result, 'post-email-queue');
}

export async function PUT(req: Request) {
  const devModeError = requireDevMode();
  if (devModeError) return devModeError;

  const json = await req.json();
  const incomingRows = Array.isArray(json?.data)
    ? (json.data as QueueRow[])
    : [];

  const incomingPostIds = Array.from(
    new Set(
      incomingRows
        .map((row) => row.post_id)
        .filter(
          (postId): postId is string =>
            typeof postId === 'string' && postId.length > 0
        )
    )
  );

  let existingPostIds: Set<string>;
  try {
    existingPostIds = await getExistingPostIds(incomingPostIds);
  } catch (error) {
    return Response.json(
      {
        message: 'Error migrating post-email-queue',
        errorDetails:
          error instanceof Error
            ? error.message
            : 'Failed to validate post IDs',
      },
      { status: 500 }
    );
  }

  const sanitizedData = incomingRows
    .filter(
      (item) =>
        typeof item.post_id === 'string' && existingPostIds.has(item.post_id)
    )
    .map((item) => ({
      ...item,
      sent_email_id: null,
    }));

  const result = await batchUpsert({
    table: 'post_email_queue',
    data: sanitizedData,
    onConflict: 'post_id,user_id',
  });
  return createMigrationResponse(result, 'post-email-queue');
}
