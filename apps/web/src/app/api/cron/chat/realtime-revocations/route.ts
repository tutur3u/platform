import { timingSafeEqual } from 'node:crypto';
import { connection, NextResponse } from 'next/server';
import {
  CHAT_REALTIME_RECOVERY_DEADLINE_MS,
  retryChatRealtimeRevocations,
} from '@/lib/chat/realtime-revocations';

const privateHeaders = { 'Cache-Control': 'private, no-store' };

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(request.headers.get('authorization') ?? '');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: privateHeaders }
    );
  }
  await connection();

  try {
    const result = await retryChatRealtimeRevocations(
      Date.now(),
      AbortSignal.any([
        request.signal,
        AbortSignal.timeout(CHAT_REALTIME_RECOVERY_DEADLINE_MS),
      ])
    );
    const ok = result.failed === 0 && !result.capped;
    return NextResponse.json(
      { ok, ...result },
      { status: ok ? 200 : 503, headers: privateHeaders }
    );
  } catch (error) {
    console.error('Chat realtime revocation recovery failed', error);
    return NextResponse.json(
      { ok: false },
      { status: 503, headers: privateHeaders }
    );
  }
}
