import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import { serverLogger } from '@/lib/infrastructure/log-drain';

const updateChatSchema = z.object({
  is_public: z.boolean().optional(),
  title: z.string().min(1).max(255).optional(),
  pinned: z.boolean().optional(),
});

export const PATCH = withSessionAuth<{ chatId: string }>(
  async (request, { supabase, user }, { chatId }) => {
    try {
      const parsed = updateChatSchema.safeParse(await request.json());

      if (!parsed.success) {
        return NextResponse.json(
          { message: 'Invalid request body', errors: parsed.error.issues },
          { status: 400 }
        );
      }

      const { data, error } = await supabase
        .from('ai_chats')
        .update(parsed.data)
        .eq('id', chatId)
        .eq('creator_id', user.id)
        .select('id')
        .maybeSingle();

      if (error) {
        return NextResponse.json(
          { message: error.message || 'Failed to update chat' },
          { status: 500 }
        );
      }

      if (!data) {
        return NextResponse.json(
          { message: 'Chat not found' },
          { status: 404 }
        );
      }

      return NextResponse.json({ success: true });
    } catch (error) {
      serverLogger.error('Unexpected AI chat update error:', error);
      return NextResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { allowAppSessionAuth: true }
);
