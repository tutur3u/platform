import { NextRequest, NextResponse } from 'next/server';
import {
  POST_EMAIL_QUEUE_DEFAULT_DRAIN_LIMIT,
  POST_EMAIL_QUEUE_DEFAULT_SEND_LIMIT,
  POST_EMAIL_QUEUE_MAX_DRAIN_LIMIT,
  POST_EMAIL_QUEUE_MAX_SEND_LIMIT,
} from '@/lib/post-email-queue/observability';
import { handlePostEmailQueueCron } from '@/lib/post-email-queue-cron';
import { requirePostEmailQueueRootAdmin } from '../auth';

function clampInteger(value: unknown, fallback: number, max: number) {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseInt(value, 10)
        : Number.NaN;

  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.floor(parsed), 1), max);
}

export async function POST(request: NextRequest) {
  const auth = await requirePostEmailQueueRootAdmin(request);
  if (auth.error) return auth.error;

  try {
    const cronSecret =
      process.env.CRON_SECRET ?? process.env.VERCEL_CRON_SECRET;
    if (!cronSecret) {
      return NextResponse.json(
        { message: 'CRON_SECRET or VERCEL_CRON_SECRET is not set' },
        { status: 500 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const limit = clampInteger(
      (body as { limit?: unknown }).limit,
      POST_EMAIL_QUEUE_DEFAULT_DRAIN_LIMIT,
      POST_EMAIL_QUEUE_MAX_DRAIN_LIMIT
    );
    const sendLimit = clampInteger(
      (body as { sendLimit?: unknown }).sendLimit,
      POST_EMAIL_QUEUE_DEFAULT_SEND_LIMIT,
      POST_EMAIL_QUEUE_MAX_SEND_LIMIT
    );
    const url = new URL('/api/cron/process-post-email-queue', request.url);
    url.searchParams.set('debug', '1');
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('sendLimit', String(sendLimit));

    return await handlePostEmailQueueCron(
      new NextRequest(url, {
        headers: {
          Authorization: `Bearer ${cronSecret}`,
        },
      })
    );
  } catch (error) {
    console.error('[PostEmailQueueInfra] Error running queue manually', {
      errorName: error instanceof Error ? error.name : typeof error,
      message: error instanceof Error ? error.message : 'Unknown error',
    });

    return NextResponse.json(
      { message: 'Error running post email queue' },
      { status: 500 }
    );
  }
}
