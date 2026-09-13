import { isDeepStrictEqual } from 'node:util';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { Json } from '@tuturuuu/types/supabase';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';

const bodySchema = z.object({
  chatId: z.uuid(),
  messages: z
    .array(
      z.object({
        id: z.uuid(),
        role: z.enum(['user', 'assistant']),
        parts: z
          .array(
            z.discriminatedUnion('type', [
              z.object({
                type: z.literal('data-live-session'),
                data: z.object({
                  status: z.enum(['started', 'ended']),
                  text: z.string().trim().min(1).max(1000),
                }),
              }),
              z.object({
                type: z.literal('source-url'),
                sourceId: z.string().trim().min(1).max(2000),
                url: z.url().max(2000),
                title: z.string().max(1000).optional(),
              }),
              z.object({
                type: z.literal('text'),
                text: z.string().max(100000),
              }),
              z.object({
                type: z.literal('dynamic-tool'),
                toolCallId: z.string().max(200),
                toolName: z.string().max(200),
                state: z.enum([
                  'input-available',
                  'output-available',
                  'output-error',
                ]),
                input: z.json().optional(),
                output: z.json().optional(),
                errorText: z.string().optional(),
              }),
            ])
          )
          .max(100),
      })
    )
    .min(1)
    .max(100)
    .refine(
      (messages) =>
        new Set(messages.map((message) => message.id)).size === messages.length,
      'Message IDs must be unique'
    ),
});

export const POST = withSessionAuth(
  async (request, { supabase, user }) => {
    const text = await request.text();
    if (text.length > 1000000)
      return NextResponse.json(
        { message: 'Conversation batch too large' },
        { status: 413 }
      );
    let parsed: ReturnType<typeof bodySchema.safeParse>;
    try {
      parsed = bodySchema.safeParse(JSON.parse(text));
    } catch {
      return NextResponse.json({ message: 'Invalid body' }, { status: 400 });
    }
    if (!parsed.success)
      return NextResponse.json({ message: 'Invalid body' }, { status: 400 });
    const { chatId, messages } = parsed.data as z.infer<typeof bodySchema>;
    const { data: existing, error: lookupError } = await supabase
      .from('ai_chats')
      .select('id, creator_id')
      .eq('id', chatId)
      .maybeSingle();
    if (lookupError)
      return NextResponse.json(
        { message: 'Could not read conversation' },
        { status: 500 }
      );
    if (existing && existing.creator_id !== user.id)
      return NextResponse.json(
        { message: 'Conversation not found' },
        { status: 404 }
      );
    if (!existing) {
      const title =
        messages
          .flatMap((message) =>
            message.parts.flatMap((part) =>
              part.type === 'text' ? [part.text] : []
            )
          )
          .join(' ')
          .slice(0, 100) || 'Mira';
      const { error } = await supabase
        .from('ai_chats')
        .insert({ id: chatId, title, creator_id: user.id });
      if (error)
        return NextResponse.json(
          { message: 'Could not create conversation' },
          { status: 500 }
        );
    }
    // Ownership is established before accessing protected message rows.
    const admin = await createAdminClient();
    const { data: previous, error: messageError } = await admin
      .from('ai_chat_messages')
      .select('id, chat_id, creator_id, metadata')
      .in(
        'id',
        messages.map((message) => message.id)
      );
    if (messageError)
      return NextResponse.json(
        { message: 'Could not read messages' },
        { status: 500 }
      );
    if (
      previous?.some(
        (message) =>
          message.chat_id !== chatId ||
          message.creator_id !== user.id ||
          (message.metadata as { channel?: string } | null)?.channel !== 'live'
      )
    ) {
      return NextResponse.json(
        { message: 'Message conflict' },
        { status: 409 }
      );
    }
    const { data: latest, error: latestError } = await admin
      .from('ai_chat_messages')
      .select('created_at')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestError)
      return NextResponse.json(
        { message: 'Could not order messages' },
        { status: 500 }
      );
    const start = Math.max(
      Date.now(),
      latest ? Date.parse(latest.created_at) + 1 : 0
    );
    const inserted = new Map<string, { content: string; metadata: Json }>();
    for (const [index, message] of messages.entries()) {
      const values = {
        content: Array.from(
          message.parts
            .flatMap((part) => (part.type === 'text' ? [part.text] : []))
            .join('\n')
        )
          .slice(0, 10000)
          .join(''),
        metadata: {
          source: 'Mira',
          channel: 'live',
          ai: { parts: message.parts },
        } as Json,
      };
      const known = previous?.some((item) => item.id === message.id);
      const { error } = known
        ? await admin
            .from('ai_chat_messages')
            .update(values)
            .eq('id', message.id)
            .eq('chat_id', chatId)
            .eq('creator_id', user.id)
        : await admin.from('ai_chat_messages').upsert(
            {
              ...values,
              id: message.id,
              chat_id: chatId,
              creator_id: user.id,
              role: message.role === 'user' ? 'USER' : 'ASSISTANT',
              created_at: new Date(start)
                .toISOString()
                .replace('Z', `${String(index).padStart(3, '0')}Z`),
            },
            { onConflict: 'id', ignoreDuplicates: true }
          );
      if (error)
        return NextResponse.json(
          { message: 'Could not save messages' },
          { status: 500 }
        );
      if (!known) inserted.set(message.id, values);
    }
    if (inserted.size) {
      const { data: persisted, error: verifyError } = await admin
        .from('ai_chat_messages')
        .select('id, chat_id, creator_id, metadata, content')
        .in('id', [...inserted.keys()]);
      if (
        verifyError ||
        !persisted ||
        persisted.length !== inserted.size ||
        persisted.some((row) => {
          const expected = inserted.get(row.id);
          return (
            !expected ||
            row.chat_id !== chatId ||
            row.creator_id !== user.id ||
            !isDeepStrictEqual(row.metadata, expected.metadata) ||
            row.content !== expected.content
          );
        })
      )
        return NextResponse.json(
          { message: 'Message conflict; retry the save' },
          { status: 409 }
        );
    }
    return NextResponse.json({ id: chatId });
  },
  { rateLimitKind: 'mutate' }
);
