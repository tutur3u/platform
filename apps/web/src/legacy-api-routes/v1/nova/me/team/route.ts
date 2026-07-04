import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';

export const GET = withSessionAuth(
  async (_request, { supabase, user }) => {
    try {
      const { data, error } = await supabase
        .schema('private')
        .from('nova_team_members')
        .select('team_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        return NextResponse.json(
          { message: 'Failed to load current team' },
          { status: 500 }
        );
      }

      return NextResponse.json({ teamId: data?.team_id ?? null });
    } catch (error) {
      console.error('Unexpected nova team lookup error:', error);
      return NextResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { allowAppSessionAuth: true }
);
