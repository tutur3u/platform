import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { getTulearnBootstrap } from '@/lib/tulearn/service';

export const GET = withSessionAuth(
  async (_request, { supabase, user }) => {
    try {
      const bootstrap = await getTulearnBootstrap({
        requestSupabase: supabase,
        user,
      });
      return NextResponse.json(bootstrap);
    } catch (error) {
      serverLogger.error('Failed to load Tulearn bootstrap:', error);
      return NextResponse.json(
        { message: 'Failed to load Tulearn' },
        { status: 500 }
      );
    }
  },
  { allowAppSessionAuth: true }
);
