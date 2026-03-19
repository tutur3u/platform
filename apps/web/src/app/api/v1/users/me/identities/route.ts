import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';

export const GET = withSessionAuth(
  async (_request, { supabase }) => {
    try {
      const { data, error } = await supabase.auth.getUserIdentities();

      if (error || !data) {
        return NextResponse.json(
          { message: error?.message || 'Failed to load linked identities' },
          { status: 400 }
        );
      }

      return NextResponse.json({
        identities: data.identities,
        canUnlink: data.identities.length >= 2,
      });
    } catch (error) {
      console.error('Error loading user identities:', error);
      return NextResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { cache: { maxAge: 30, swr: 30 } }
);
