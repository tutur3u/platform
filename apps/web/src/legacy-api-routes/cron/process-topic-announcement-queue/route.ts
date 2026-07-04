import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { sendTopicAnnouncement } from '@/legacy-api-routes/v1/workspaces/[wsId]/topic-announcements/email';
import {
  getPrivateSchemaClient,
  type TopicAnnouncementsSupabaseClient,
} from '@/legacy-api-routes/v1/workspaces/[wsId]/topic-announcements/shared';
import { withCronLogDrain } from '@/lib/infrastructure/log-drain';

const LOG_PREFIX = '[TopicAnnouncementQueueCron]';
const BATCH_LIMIT = 25;
const PROCESSING_STALE_MS = 15 * 60 * 1000;

type QueuedTopicAnnouncementRow = {
  created_by: string | null;
  id: string;
  updated_by: string | null;
  ws_id: string;
};

function getCronSecret() {
  return process.env.CRON_SECRET ?? process.env.VERCEL_CRON_SECRET ?? '';
}

function verifyCronRequest(request: NextRequest) {
  const cronSecret = getCronSecret();

  if (!cronSecret) {
    return {
      error: NextResponse.json(
        { ok: false, error: 'CRON_SECRET or VERCEL_CRON_SECRET is not set' },
        { status: 500 }
      ),
      ok: false as const,
    };
  }

  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return {
      error: NextResponse.json(
        { ok: false, error: 'Unauthorized' },
        { status: 401 }
      ),
      ok: false as const,
    };
  }

  return { ok: true as const };
}

async function resetStaleProcessingAnnouncements({
  now,
  sbAdmin,
}: {
  now: Date;
  sbAdmin: TopicAnnouncementsSupabaseClient;
}) {
  const cutoff = new Date(now.getTime() - PROCESSING_STALE_MS).toISOString();
  const { error } = await sbAdmin
    .from('topic_announcements')
    .update({
      last_error: 'PROCESSING_TIMEOUT',
      status: 'queued',
    })
    .eq('status', 'processing')
    .not('scheduled_send_at', 'is', null)
    .lte('scheduled_send_at', now.toISOString())
    .lt('updated_at', cutoff);

  if (error) {
    throw error;
  }
}

async function claimQueuedAnnouncement({
  actorUserId,
  now,
  row,
  sbAdmin,
}: {
  actorUserId: string;
  now: string;
  row: QueuedTopicAnnouncementRow;
  sbAdmin: TopicAnnouncementsSupabaseClient;
}) {
  const { data, error } = await sbAdmin
    .from('topic_announcements')
    .update({
      last_error: null,
      status: 'processing',
      updated_by: actorUserId,
    })
    .eq('id', row.id)
    .eq('ws_id', row.ws_id)
    .eq('status', 'queued')
    .not('scheduled_send_at', 'is', null)
    .lte('scheduled_send_at', now)
    .select('id, ws_id, created_by, updated_by')
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data ?? null) as QueuedTopicAnnouncementRow | null;
}

async function handler(request: NextRequest) {
  const verified = verifyCronRequest(request);
  if (!verified.ok) return verified.error;

  const sbAdmin = getPrivateSchemaClient(
    (await createAdminClient()) as TypedSupabaseClient
  ) as TopicAnnouncementsSupabaseClient;
  const nowDate = new Date();
  const now = nowDate.toISOString();

  try {
    await resetStaleProcessingAnnouncements({ now: nowDate, sbAdmin });
  } catch (cause) {
    const message =
      cause instanceof Error ? cause.message : 'Unknown processing reset error';
    console.error(
      `${LOG_PREFIX} Failed to reset stale processing announcements`,
      { error: message }
    );
    return NextResponse.json(
      { message: 'Failed to reset stale processing announcements' },
      { status: 500 }
    );
  }

  const { data: dueRows, error } = await sbAdmin
    .from('topic_announcements')
    .select('id, ws_id, created_by, updated_by')
    .eq('status', 'queued')
    .not('scheduled_send_at', 'is', null)
    .lte('scheduled_send_at', now)
    .order('scheduled_send_at', { ascending: true })
    .limit(BATCH_LIMIT);

  if (error) {
    console.error(`${LOG_PREFIX} Failed to load queued announcements`, {
      error: error.message,
    });
    return NextResponse.json(
      { message: 'Failed to load queue' },
      { status: 500 }
    );
  }

  const results: Array<{
    announcementId: string;
    error?: string;
    success: boolean;
    wsId: string;
  }> = [];

  for (const row of (dueRows ?? []) as QueuedTopicAnnouncementRow[]) {
    try {
      const actorUserId = row.updated_by ?? row.created_by;
      if (!actorUserId) {
        results.push({
          announcementId: row.id,
          error: 'MISSING_ACTOR',
          success: false,
          wsId: row.ws_id,
        });
        continue;
      }

      const claimedRow = await claimQueuedAnnouncement({
        actorUserId,
        now,
        row,
        sbAdmin,
      });

      if (!claimedRow) {
        results.push({
          announcementId: row.id,
          error: 'ALREADY_CLAIMED',
          success: false,
          wsId: row.ws_id,
        });
        continue;
      }

      const result = await sendTopicAnnouncement({
        actorUserId,
        announcementId: claimedRow.id,
        normalizedWsId: claimedRow.ws_id,
        request,
        resend: false,
        sbAdmin,
      });

      if ('error' in result) {
        results.push({
          announcementId: row.id,
          error: result.error,
          success: false,
          wsId: row.ws_id,
        });
        console.warn(`${LOG_PREFIX} Send failed`, {
          announcementId: row.id,
          error: result.error,
          wsId: row.ws_id,
        });
      } else {
        results.push({
          announcementId: row.id,
          success: true,
          wsId: row.ws_id,
        });
      }
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : 'Unknown send failure';
      results.push({
        announcementId: row.id,
        error: message,
        success: false,
        wsId: row.ws_id,
      });
      console.error(`${LOG_PREFIX} Unexpected send failure`, {
        announcementId: row.id,
        error: message,
        wsId: row.ws_id,
      });
    }
  }

  return NextResponse.json({
    processed: results.length,
    results,
  });
}

export async function GET(req: NextRequest) {
  return withCronLogDrain(
    {
      jobId: 'process-topic-announcement-queue',
      path: '/api/cron/process-topic-announcement-queue',
      request: req,
    },
    () => handler(req)
  );
}

export const POST = GET;
