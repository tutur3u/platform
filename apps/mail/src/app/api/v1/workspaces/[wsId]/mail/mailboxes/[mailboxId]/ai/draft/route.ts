import { google } from '@ai-sdk/google';
import { withAiMemory } from '@tuturuuu/ai/memory';
import { generateObject } from 'ai';
import { type NextRequest, NextResponse } from 'next/server';
import { emailDraftSchema } from '@/app/api/ai/email-draft/schema';
import { buildMailAiDraftPrompt } from '@/lib/mail/ai-draft';
import { getMailThread, requireMailboxAccess } from '@/lib/mail/repository';
import { parseJsonBody, withMailContext } from '@/lib/mail/route-utils';
import { generateMailAiDraftSchema } from '@/lib/mail/schemas';

type RouteParams = { mailboxId: string; wsId: string };

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  const { mailboxId, wsId } = await params;
  const body = await parseJsonBody(request, generateMailAiDraftSchema);
  if (!body.ok) return body.response;

  return withMailContext(request, wsId, async (ctx) => {
    const access = await requireMailboxAccess(ctx, mailboxId, [
      'admin',
      'owner',
      'sender',
    ]);
    if (!access) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const thread = body.data.threadId
      ? await getMailThread({ ctx, mailboxId, threadId: body.data.threadId })
      : null;
    if (body.data.threadId && !thread) {
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 });
    }

    const threadContext = (thread?.messages ?? [])
      .slice(-20)
      .map(
        (message) =>
          `[${message.fromName || message.fromAddress} <${message.fromAddress}>]\nSubject: ${message.subject}\n${(message.bodyText ?? message.snippet ?? '').slice(0, 4000)}`
      )
      .join('\n\n--- message boundary ---\n\n');
    const prompt = buildMailAiDraftPrompt({
      currentBody: body.data.bodyText ?? '',
      currentSubject: body.data.subject ?? '',
      instructions: body.data.instructions,
      mailboxInstructions: access.mailbox.aiInstructions,
      mode: body.data.mode,
      recipients: body.data.recipients ?? [],
      senderAddress: access.mailbox.address,
      senderName: access.mailbox.displayName,
      threadContext,
    });

    const result = await generateObject({
      model: await withAiMemory({
        customId: `mail-compose-${mailboxId}-${body.data.threadId ?? ctx.user.id}`,
        model: google('gemini-3.1-flash-lite'),
        product: 'ai_chat',
        source: 'mail_composer',
        surface: 'mail_composer',
        userId: ctx.user.id,
        wsId: ctx.normalizedWsId,
      }),
      prompt,
      schema: emailDraftSchema,
    });

    return NextResponse.json(result.object);
  });
}
