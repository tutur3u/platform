import { google } from '@ai-sdk/google';
import { toBareModelName } from '@tuturuuu/ai/credits/model-mapping';
import { reserveNestedModelBudget } from '@tuturuuu/ai/credits/nested-budget';
import {
  PlanModelResolutionError,
  resolvePlanModel,
} from '@tuturuuu/ai/credits/resolve-plan-model';
import { normalizeAiTokenUsage } from '@tuturuuu/ai/credits/token-usage';
import { withAiMemory } from '@tuturuuu/ai/memory';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { generateObject, NoObjectGeneratedError } from 'ai';
import { type NextRequest, NextResponse } from 'next/server';
import { emailDraftSchema } from '@/app/api/ai/email-draft/schema';
import { buildMailAiDraftPrompt } from '@/lib/mail/ai-draft';
import { getMailThread, requireMailboxAccess } from '@/lib/mail/repository';
import { parseJsonBody, withMailContext } from '@/lib/mail/route-utils';
import { generateMailAiDraftSchema } from '@/lib/mail/schemas';

type RouteParams = { mailboxId: string; wsId: string };

const MAIL_DRAFT_MODEL = 'gemini-3.1-flash-lite';
const MAIL_DRAFT_MAX_RESERVE_CREDITS = 15;
const MAIL_DRAFT_MAX_OUTPUT_TOKENS = 2048;

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

    let modelId: string;
    try {
      const resolvedModel = await resolvePlanModel({
        capability: 'language',
        requestedModel: MAIL_DRAFT_MODEL,
        wsId: ctx.normalizedWsId,
      });
      modelId = resolvedModel.modelId;
    } catch (error) {
      if (error instanceof PlanModelResolutionError) {
        return NextResponse.json(
          {
            error: 'AI email drafting is not available on your current plan.',
            code: 'NO_ALLOCATION',
          },
          { status: 403 }
        );
      }
      throw error;
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

    const sbAdmin = await createAdminClient();
    const budget = await reserveNestedModelBudget({
      sbAdmin,
      wsId: ctx.normalizedWsId,
      userId: ctx.user.id,
      modelId,
      feature: 'chat',
      estimatedInputTokens: Math.max(1, Math.ceil(prompt.length / 3)),
      attemptCount: 1,
      maxReserveCredits: MAIL_DRAFT_MAX_RESERVE_CREDITS,
      maxOutputTokensLimit: MAIL_DRAFT_MAX_OUTPUT_TOKENS,
      metadata: {
        source: 'mail_composer',
        mailboxId,
      },
    });

    if (!budget.ok) {
      return NextResponse.json(
        {
          error:
            budget.status === 503
              ? 'AI request budget could not be verified'
              : 'You have run out of AI credits.',
          code: budget.code,
        },
        { status: budget.status }
      );
    }

    try {
      const result = await generateObject({
        model: await withAiMemory({
          customId: `mail-compose-${mailboxId}-${body.data.threadId ?? ctx.user.id}`,
          model: google(toBareModelName(modelId)),
          product: 'ai_chat',
          source: 'mail_composer',
          surface: 'mail_composer',
          userId: ctx.user.id,
          wsId: ctx.normalizedWsId,
        }),
        prompt,
        maxRetries: 0,
        maxOutputTokens: budget.perAttemptMaxOutputTokens,
        schema: emailDraftSchema,
      });

      const usage = normalizeAiTokenUsage(result.usage);
      await budget.settle({
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        reasoningTokens: usage.reasoningTokens,
      });

      return NextResponse.json(result.object);
    } catch (error) {
      if (NoObjectGeneratedError.isInstance(error) && error.usage) {
        const usage = normalizeAiTokenUsage(error.usage);
        await budget
          .settle({
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            reasoningTokens: usage.reasoningTokens,
          })
          .catch(() => undefined);
      } else {
        await budget.release().catch(() => undefined);
      }
      throw error;
    }
  });
}
