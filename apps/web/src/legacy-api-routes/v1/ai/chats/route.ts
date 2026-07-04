import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';

export const GET = withSessionAuth(
  async (_request, { supabase, user }) => {
    try {
      const { data, error } = await supabase
        .from('ai_chats')
        .select('id, title, created_at, pinned, is_public, model')
        .eq('creator_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        return NextResponse.json(
          { message: 'Failed to load chats' },
          { status: 500 }
        );
      }

      return NextResponse.json(data ?? []);
    } catch (error) {
      console.error('Unexpected AI chats list error:', error);
      return NextResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { allowAppSessionAuth: true }
);
