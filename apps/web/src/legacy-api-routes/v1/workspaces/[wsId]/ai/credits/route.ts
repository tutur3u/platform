import {
  AiCreditsStatusError,
  getAiCreditsStatus,
} from '@tuturuuu/payment-core';
import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';

const AI_CREDITS_APP_SESSION_AUTH = {
  targetApp: ['chat', 'mind', 'pay', 'tasks'],
} as const;

export const GET = withSessionAuth<{ wsId: string }>(
  async (_request, { user, supabase }, { wsId }) => {
    try {
      const status = await getAiCreditsStatus({
        accessClient: supabase,
        userId: user.id,
        wsId,
      });

      return NextResponse.json(status);
    } catch (error) {
      if (error instanceof AiCreditsStatusError) {
        return NextResponse.json(
          { error: error.message },
          { status: error.status }
        );
      }

      console.error('Error in AI credits route:', error);
      return NextResponse.json(
        { error: 'Failed to get AI credit status' },
        { status: 500 }
      );
    }
  },
  {
    allowAppSessionAuth: AI_CREDITS_APP_SESSION_AUTH,
    cache: { maxAge: 30, swr: 30 },
  }
);
