import { getAppSessionUserFromRequest } from '@tuturuuu/auth/app-session';
import {
  AiCreditsStatusError,
  getAiCreditsStatus,
} from '@tuturuuu/payment-core';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const user = getAppSessionUserFromRequest(request, {
    targetApp: ['pay', 'platform'],
  });

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { wsId } = await params;
    const accessClient = await createAdminClient();
    const status = await getAiCreditsStatus({
      accessClient,
      userId: user.id,
      wsId,
    });

    return NextResponse.json(status, {
      headers: { 'Cache-Control': 'private, max-age=30' },
    });
  } catch (error) {
    if (error instanceof AiCreditsStatusError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }

    console.error('Error in Pay AI credits route:', error);
    return NextResponse.json(
      { error: 'Failed to get AI credit status' },
      { status: 500 }
    );
  }
}
