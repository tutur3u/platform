import { getTulearnBootstrap } from '@tuturuuu/education-core/tulearn/service';
import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';

export const GET = withSessionAuth(
  async (_request, { supabase, user }) => {
    try {
      const bootstrap = await getTulearnBootstrap({
        requestSupabase: supabase,
        user,
      });
      return NextResponse.json(bootstrap);
    } catch (error) {
      console.error('Failed to load Tulearn bootstrap:', error);
      return NextResponse.json(
        { message: 'Failed to load Tulearn' },
        { status: 500 }
      );
    }
  },
  { allowAppSessionAuth: true }
);
