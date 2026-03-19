import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';

const RestoreChatRequestSchema = z.object({
  chatId: z.guid(),
});

export const POST = withSessionAuth(
  async (req, { user }) => {
    try {
      const body = await req.json();
      const { chatId } = RestoreChatRequestSchema.parse(body);
      const sbAdmin = await createAdminClient();

      const { data: chatData, error: chatError } = await sbAdmin
        .from('ai_chats')
        .select('id, title, model, is_public')
        .eq('id', chatId)
        .eq('creator_id', user.id)
        .maybeSingle();

      if (chatError) {
        return NextResponse.json(
          { message: 'Failed to fetch chat' },
          { status: 500 }
        );
      }

      if (!chatData) {
        return NextResponse.json(
          { message: 'Chat not found' },
          { status: 404 }
        );
      }

      const { data: messagesData, error: messagesError } = await sbAdmin
        .from('ai_chat_messages')
        .select(
          'id, role, content, metadata, ai_chats!chat_id!inner(creator_id)'
        )
        .eq('chat_id', chatId)
        .eq('ai_chats.creator_id', user.id)
        .order('created_at', { ascending: true });

      if (messagesError) {
        return NextResponse.json(
          { message: 'Failed to fetch chat messages' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        chat: chatData,
        messages: (messagesData ?? []).map(
          ({ ai_chats: _aiChat, ...message }) => message
        ),
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          { message: 'Invalid request body', errors: error.issues },
          { status: 400 }
        );
      }

      console.error('Error restoring chat:', error);
      return NextResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { rateLimitKind: 'read' }
);
