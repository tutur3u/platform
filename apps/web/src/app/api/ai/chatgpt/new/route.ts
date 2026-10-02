import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import { getChatGPTAccess, parseChatGPTModel } from '@/lib/chatgpt/provider';
import { chatGPTEnabled } from '@/lib/chatgpt/storage';

const bodySchema = z.object({
  id: z.uuid(),
  model: z.string(),
  message: z.string().trim().min(1).max(100_000),
});

export const POST = withSessionAuth(async (request, { user, supabase }) => {
  if (!chatGPTEnabled())
    return NextResponse.json({ error: 'Unavailable' }, { status: 404 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: 'Invalid chat' }, { status: 400 });
  try {
    const { clientId } = parseChatGPTModel(parsed.data.model);
    await getChatGPTAccess(user.id, clientId);
    // A local title avoids a hidden provider call or Tuturuuu credit charge.
    const title = Array.from(parsed.data.message.replace(/\s+/g, ' '))
      .slice(0, 80)
      .join('');
    const { data, error } = await supabase
      .from('ai_chats')
      .insert({
        id: parsed.data.id,
        creator_id: user.id,
        model: parsed.data.model,
        title,
      })
      .select('id')
      .single();
    if (error || !data)
      return NextResponse.json(
        { error: 'Unable to create chat' },
        { status: 500 }
      );
    return NextResponse.json({ id: data.id, title }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: 'Reconnect your ChatGPT account' },
      { status: 403 }
    );
  }
});
