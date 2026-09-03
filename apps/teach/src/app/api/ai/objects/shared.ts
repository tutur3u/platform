import { google } from '@ai-sdk/google';
import { capMaxOutputTokensByCredits } from '@tuturuuu/ai/credits/cap-output-tokens';
import {
  checkAiCredits,
  deductAiCredits,
} from '@tuturuuu/ai/credits/check-credits';
import { withAiMemory } from '@tuturuuu/ai/memory';
import { requireTeachWorkspaceAccess } from '@tuturuuu/education-core/teach/api';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { Output, streamText } from 'ai';
import { NextResponse } from 'next/server';
import type { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';

const MODEL_ID = 'google/gemini-3.1-flash-lite';
const MODEL_NAME = 'gemini-3.1-flash-lite';
const CREDIT_FEATURE = 'generate';

const SAFETY_SETTINGS = [
  {
    category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
    threshold: 'BLOCK_NONE',
  },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
  {
    category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
    threshold: 'BLOCK_NONE',
  },
];

type ObjectGenerationConfig<TInput extends { wsId: string }> = {
  buildPrompt: (input: TInput) => string;
  customIdPrefix: string;
  outputSchema: z.ZodType;
  requestSchema: z.ZodType<TInput>;
  source: string;
  surface: string;
};

async function isChatEnabled(
  sbAdmin: TypedSupabaseClient,
  wsId: string
): Promise<'enabled' | 'disabled' | 'error'> {
  const { count, error } = await sbAdmin
    .from('workspace_secrets')
    .select('id', { count: 'exact', head: true })
    .eq('ws_id', wsId)
    .eq('name', 'ENABLE_CHAT')
    .eq('value', 'true');

  if (error) {
    console.error('Failed to check Teach AI feature access', { error, wsId });
    return 'error';
  }

  return count && count > 0 ? 'enabled' : 'disabled';
}

export function createTeachObjectGenerationHandler<
  TInput extends { wsId: string },
>(config: ObjectGenerationConfig<TInput>) {
  return withSessionAuth(
    async (request, context) => {
      if (!context.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      let rawBody: unknown;
      try {
        rawBody = await request.json();
      } catch {
        return NextResponse.json(
          { error: 'Invalid request body' },
          { status: 400 }
        );
      }

      const parsedBody = config.requestSchema.safeParse(rawBody);
      if (!parsedBody.success) {
        return NextResponse.json(
          { error: 'Invalid request body', issues: parsedBody.error.issues },
          { status: 400 }
        );
      }

      const access = await requireTeachWorkspaceAccess({
        context,
        permission: ['update_user_groups', 'view_user_groups'],
        wsId: parsedBody.data.wsId,
      });
      if (access instanceof NextResponse) return access;

      const { normalizedWsId } = access;
      const sbAdmin = access.sbAdmin as TypedSupabaseClient;
      const featureAccess = await isChatEnabled(sbAdmin, normalizedWsId);

      if (featureAccess === 'error') {
        return NextResponse.json(
          { error: 'Internal Server Error' },
          { status: 500 }
        );
      }
      if (featureAccess === 'disabled') {
        return NextResponse.json(
          { error: 'You are not allowed to use this feature.' },
          { status: 403 }
        );
      }

      const creditCheck = await checkAiCredits(
        normalizedWsId,
        MODEL_ID,
        CREDIT_FEATURE,
        { userId: context.user.id }
      );
      if (!creditCheck.allowed) {
        return NextResponse.json(
          {
            error: creditCheck.errorMessage || 'AI credits insufficient',
            code: creditCheck.errorCode,
          },
          { status: 403 }
        );
      }

      const cappedMaxOutput = await capMaxOutputTokensByCredits(
        sbAdmin,
        MODEL_ID,
        creditCheck.maxOutputTokens ?? null,
        creditCheck.remainingCredits
      );
      if (cappedMaxOutput === null && creditCheck.remainingCredits <= 0) {
        return NextResponse.json(
          { error: 'AI credits insufficient', code: 'CREDITS_EXHAUSTED' },
          { status: 403 }
        );
      }

      try {
        const result = streamText({
          model: await withAiMemory({
            customId: `${config.customIdPrefix}-${Date.now()}`,
            model: google(MODEL_NAME),
            product: 'teach',
            source: config.source,
            surface: config.surface,
            userId: context.user.id,
            wsId: normalizedWsId,
          }),
          prompt: config.buildPrompt(parsedBody.data),
          output: Output.object({ schema: config.outputSchema }),
          ...(cappedMaxOutput ? { maxOutputTokens: cappedMaxOutput } : {}),
          onFinish: async ({ usage }) => {
            const deduction = await deductAiCredits({
              feature: CREDIT_FEATURE,
              inputTokens: usage.inputTokens ?? 0,
              metadata: { source: config.source, surface: config.surface },
              modelId: MODEL_ID,
              outputTokens: usage.outputTokens ?? 0,
              reasoningTokens: usage.outputTokenDetails?.reasoningTokens ?? 0,
              userId: context.user.id,
              wsId: normalizedWsId,
            });

            if (!deduction.success) {
              console.warn('Failed to deduct Teach object-generation credits', {
                errorCode: deduction.errorCode,
                source: config.source,
                userId: context.user.id,
                wsId: normalizedWsId,
              });
            }
          },
          providerOptions: {
            google: { safetySettings: SAFETY_SETTINGS },
          },
        });

        // Remove client backpressure so onFinish and its awaited credit settlement
        // complete even if the browser disconnects from the response stream.
        void result.consumeStream({
          onError: (error) =>
            console.error('Teach object-generation stream failed', {
              error,
              source: config.source,
              userId: context.user.id,
              wsId: normalizedWsId,
            }),
        });

        const response = result.toTextStreamResponse();
        return new NextResponse(response.body, {
          headers: response.headers,
          status: response.status,
          statusText: response.statusText,
        });
      } catch (error) {
        console.error('Failed to start Teach object generation', {
          error,
          source: config.source,
          userId: context.user.id,
          wsId: normalizedWsId,
        });
        return NextResponse.json(
          { error: 'Internal Server Error' },
          { status: 500 }
        );
      }
    },
    { allowAppSessionAuth: { targetApp: 'teach' }, allowAiTempAuth: true }
  );
}
