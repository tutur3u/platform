import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { DEV_MODE } from '@/constants/common';

export async function POST() {
  if (!DEV_MODE) {
    return NextResponse.json(
      { error: 'This endpoint is only available in development mode' },
      { status: 403 }
    );
  }

  try {
    const admin = await createAdminClient();
    const { data, error } = await admin.rpc('admin_reset_rate_limits');

    if (error) {
      console.error('Failed to reset rate limits:', error);
      return NextResponse.json(
        { error: 'Failed to reset rate limits' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      deletedCount: data ?? 0,
    });
  } catch (error) {
    console.error('Unexpected rate limit reset error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
