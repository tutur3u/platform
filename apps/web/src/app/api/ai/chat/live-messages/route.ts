import { isDeepStrictEqual } from 'node:util';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { Json } from '@tuturuuu/types/supabase';
import { NextResponse } from 'next/server';
import { v5 as uuidv5 } from 'uuid';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';

const LIVE_CONVERSATION_NAMESPACE = 'f1155edc-4ef9-4534-8582-86c55a56df85';
const LIVE_MESSAGE_NAMESPACE = '9295f28d-7083-44e5-bb44-661f5068b1be';

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
        new Set(messages.map((message) => message.id.toLowerCase())).size ===
        messages.length,
      'Message IDs must be unique'
    ),
});

export const POST = withSessionAuth(
  async (request, { user }) => {
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
    const { chatId: clientChatId, messages } = parsed.data;
    const admin = await createAdminClient({ noCookie: true });
    const mappedChatId = uuidv5(
      JSON.stringify([user.id, clientChatId.toLowerCase()]),
      LIVE_CONVERSATION_NAMESPACE
    );
    const { data: existing, error: lookupError } = await admin
      .from('ai_chats')
      .select('id')
      .eq('creator_id', user.id)
      .in('id', [clientChatId, mappedChatId]);
    if (lookupError)
      return NextResponse.json(
        { message: 'Could not read conversation' },
        { status: 500 }
      );

    const chatId =
      existing?.find((chat) => chat.id === clientChatId.toLowerCase())?.id ??
      mappedChatId;
    if (!existing?.some((chat) => chat.id === chatId)) {
      const title =
        messages
          .flatMap((message) =>
            message.parts.flatMap((part) =>
              part.type === 'text' ? [part.text] : []
            )
          )
          .join(' ')
          .slice(0, 100) || 'Mira';
      const { error } = await admin
        .from('ai_chats')
        .upsert(
          { id: chatId, title, creator_id: user.id },
          { onConflict: 'id', ignoreDuplicates: true }
        );
      if (error)
        return NextResponse.json(
          { message: 'Could not create conversation' },
          { status: 500 }
        );
    }
    const { data: ownedChat, error: ownershipError } = await admin
      .from('ai_chats')
      .select('id')
      .eq('id', chatId)
      .eq('creator_id', user.id)
      .maybeSingle();
    if (ownershipError || !ownedChat)
      return NextResponse.json(
        { message: 'Could not read conversation' },
        { status: 500 }
      );

    const keyedMessages = messages.map((message) => ({
      message,
      clientMessageId: message.id.toLowerCase(),
      scopedId: uuidv5(
        JSON.stringify([user.id, chatId, message.id.toLowerCase()]),
        LIVE_MESSAGE_NAMESPACE
      ),
    }));
    const readOwnedMessageKeys = (ids: string[]) =>
      admin
        .from('ai_chat_messages')
        .select(
          'id, channel:metadata->>channel, client_message_id:metadata->>liveMessageId'
        )
        .eq('chat_id', chatId)
        .eq('creator_id', user.id)
        .in('id', ids);

    // Older transcripts used the caller's ID as the row ID. Resolve those
    // rows only inside the owned conversation so retries preserve them.
    const [scoped, legacy] = await Promise.all([
      readOwnedMessageKeys(keyedMessages.map(({ scopedId }) => scopedId)),
      readOwnedMessageKeys(
        keyedMessages.map(({ clientMessageId }) => clientMessageId)
      ),
    ]);
    if (scoped.error || legacy.error)
      return NextResponse.json(
        { message: 'Could not read messages' },
        { status: 500 }
      );
    const previous = new Map(
      [...(scoped.data ?? []), ...(legacy.data ?? [])].map((row) => [
        row.id,
        row,
      ])
    );
    const targets = keyedMessages.map(
      ({ message, clientMessageId, scopedId }) => ({
        message,
        clientMessageId,
        id: scopedId,
        existing: previous.get(scopedId) ?? previous.get(clientMessageId),
      })
    );
    if (
      targets.some(
        ({ clientMessageId, existing }) =>
          existing &&
          (existing.channel !== 'live' ||
            (existing.id !== clientMessageId &&
              existing.client_message_id != null &&
              existing.client_message_id !== clientMessageId))
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
    for (const [
      index,
      { message, clientMessageId, id, existing },
    ] of targets.entries()) {
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
          liveMessageId: existing?.client_message_id ?? clientMessageId,
          ai: { parts: message.parts },
        } as Json,
      };
      const { error } = existing
        ? await admin
            .from('ai_chat_messages')
            .update(values)
            .eq('id', existing.id)
            .eq('chat_id', chatId)
            .eq('creator_id', user.id)
            .eq('metadata->>channel', 'live')
        : await admin.from('ai_chat_messages').upsert(
            {
              ...values,
              id,
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
      if (!existing) inserted.set(id, values);
    }
    if (inserted.size) {
      const { data: persisted, error: verifyError } = await admin
        .from('ai_chat_messages')
        .select('id, metadata, content')
        .eq('chat_id', chatId)
        .eq('creator_id', user.id)
        .in('id', [...inserted.keys()]);
      if (
        verifyError ||
        !persisted ||
        persisted.length !== inserted.size ||
        persisted.some((row) => {
          const expected = inserted.get(row.id);
          return (
            !expected ||
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
