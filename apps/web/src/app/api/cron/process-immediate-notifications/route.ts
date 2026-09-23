import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { NextRequest } from 'next/server';
import { connection, NextResponse } from 'next/server';
import { POST as sendImmediate } from '@/app/api/notifications/send-immediate/route';

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    await connection();
    const admin = await createAdminClient();
    const { error } = await admin
      .schema('private')
      .rpc('requeue_mail_push_batches');
    if (error) throw error;
    // The same dispatcher applies Mail access checks on every retry and also
    // drains pending immediate batches whose original database webhook was lost.
    return sendImmediate(request);
  } catch (error) {
    console.error('Immediate notification recovery failed:', error);
    return NextResponse.json(
      { error: 'Notification recovery failed' },
      { status: 500 }
    );
  }
}
