import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { sendTopicAnnouncement } from '@/app/api/v1/workspaces/[wsId]/topic-announcements/email';
import { serverLogger, withCronLogDrain } from '@/lib/infrastructure/log-drain';

const LOG_PREFIX = '[TopicAnnouncementQueueCron]';
const BATCH_LIMIT = 25;

async function handler(request: NextRequest) {
  const sbAdmin = (await createAdminClient()) as TypedSupabaseClient;
  const now = new Date().toISOString();

  const { data: dueRows, error } = await sbAdmin
    .from('topic_announcements')
    .select('id, ws_id, created_by, updated_by')
    .eq('status', 'queued')
    .not('scheduled_send_at', 'is', null)
    .lte('scheduled_send_at', now)
    .order('scheduled_send_at', { ascending: true })
    .limit(BATCH_LIMIT);

  if (error) {
    serverLogger.error(`${LOG_PREFIX} Failed to load queued announcements`, {
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

  for (const row of dueRows ?? []) {
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

      const result = await sendTopicAnnouncement({
        actorUserId,
        announcementId: row.id,
        normalizedWsId: row.ws_id,
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
        serverLogger.warn(`${LOG_PREFIX} Send failed`, {
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
      serverLogger.error(`${LOG_PREFIX} Unexpected send failure`, {
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
