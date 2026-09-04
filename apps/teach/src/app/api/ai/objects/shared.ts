import { google } from '@ai-sdk/google';
import { capMaxOutputTokensByCredits } from '@tuturuuu/ai/credits/cap-output-tokens';
import { checkAiCredits } from '@tuturuuu/ai/credits/check-credits';
import {
  releaseFixedAiCreditReservation,
  reserveFixedAiCredits,
} from '@tuturuuu/ai/credits/reservations';
import { withAiMemory } from '@tuturuuu/ai/memory';
import { requireTeachWorkspaceAccess } from '@tuturuuu/education-core/teach/api';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { invalidateAiCreditSnapshot } from '@tuturuuu/utils/ai-temp-auth';
import {
  createTextStreamResponse,
  Output,
  streamText,
  type TextStreamPart,
  type ToolSet,
} from 'ai';
import { NextResponse } from 'next/server';
import type { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';

const MODEL_ID = 'google/gemini-3.1-flash-lite';
const MODEL_NAME = 'gemini-3.1-flash-lite';
const CREDIT_FEATURE = 'generate';
const RESERVATION_TTL_SECONDS = 15 * 60;
const STREAM_ERROR_MESSAGE = 'AI object generation stream failed';

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

type MeteredSettlementRow = {
  credits_deducted?: number | string;
  error_code?: string | null;
  remaining_credits?: number | string;
  success?: boolean;
};

type UsageCostRow = {
  billed_credits?: number | string;
};

type PrivateRpcClient = {
  schema: (schema: 'private') => {
    rpc: (
      fn: 'calculate_ai_studio_usage_cost',
      params: Record<string, unknown>
    ) => Promise<{ data: UsageCostRow[] | null; error: unknown }>;
  };
  rpc: (
    fn: 'settle_metered_ai_credit_reservation',
    params: Record<string, unknown>
  ) => Promise<{ data: MeteredSettlementRow[] | null; error: unknown }>;
};

function createObjectTextStream<TOOLS extends ToolSet>(
  stream: ReadableStream<TextStreamPart<TOOLS>>
): ReadableStream<string> {
  const reader = stream.getReader();
  let readerReleased = false;
  const releaseReader = () => {
    if (readerReleased) return;
    readerReleased = true;
    reader.releaseLock();
  };

  return new ReadableStream<string>({
    async cancel(reason) {
      try {
        await reader.cancel(reason);
      } finally {
        releaseReader();
      }
    },
    async pull(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            releaseReader();
            controller.close();
            return;
          }

          if (value.type === 'error') {
            await reader.cancel();
            releaseReader();
            controller.error(new Error(STREAM_ERROR_MESSAGE));
            return;
          }

          if (value.type === 'text-delta') {
            controller.enqueue(value.text);
            return;
          }
        }
      } catch {
        releaseReader();
        controller.error(new Error(STREAM_ERROR_MESSAGE));
      }
    },
  });
}

async function calculateReservationCredits(
  sbAdmin: TypedSupabaseClient,
  input: {
    inputTokens: number;
    maxOutputTokens: number;
    modelId: string;
    wsId: string;
  }
): Promise<number | null> {
  const client = sbAdmin as unknown as PrivateRpcClient;
  const { data, error } = await client
    .schema('private')
    .rpc('calculate_ai_studio_usage_cost', {
      p_input_tokens: input.inputTokens,
      p_model_id: input.modelId,
      p_output_tokens: input.maxOutputTokens,
      // Providers account reasoning separately from visible output. Reserving
      // the cap for both is conservative and guarantees actual settlement fits.
      p_reasoning_tokens: input.maxOutputTokens,
      p_ws_id: input.wsId,
    });
  const credits = Number(data?.[0]?.billed_credits ?? 0);
  return error || !Number.isFinite(credits) || credits <= 0 ? null : credits;
}

async function settleReservation(
  sbAdmin: TypedSupabaseClient,
  input: {
    inputTokens: number;
    metadata: Record<string, unknown>;
    outputTokens: number;
    reasoningTokens: number;
    reservationId: string;
    userId: string;
    wsId: string;
  }
): Promise<boolean> {
  const client = sbAdmin as unknown as PrivateRpcClient;
  try {
    const { data, error } = await client.rpc(
      'settle_metered_ai_credit_reservation',
      {
        p_input_tokens: input.inputTokens,
        p_metadata: input.metadata,
        p_output_tokens: input.outputTokens,
        p_reasoning_tokens: input.reasoningTokens,
        p_reservation_id: input.reservationId,
      }
    );
    const success = !error && data?.[0]?.success === true;
    if (success) {
      await invalidateAiCreditSnapshot({
        userId: input.userId,
        wsId: input.wsId,
      });
    }
    return success;
  } catch {
    return false;
  }
}

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
      if (cappedMaxOutput === null) {
        return NextResponse.json(
          { error: 'AI credits insufficient', code: 'CREDITS_EXHAUSTED' },
          { status: 403 }
        );
      }

      const prompt = config.buildPrompt(parsedBody.data);
      // UTF-8 bytes are a deliberately conservative upper bound for prompt
      // tokens and keep the reservation safe without provider tokenization.
      const estimatedInputTokens = new TextEncoder().encode(prompt).length;
      const reservationCredits = await calculateReservationCredits(sbAdmin, {
        inputTokens: estimatedInputTokens,
        maxOutputTokens: cappedMaxOutput,
        modelId: MODEL_ID,
        wsId: normalizedWsId,
      });
      if (reservationCredits === null) {
        return NextResponse.json(
          { error: 'Internal Server Error' },
          { status: 500 }
        );
      }

      const reservation = await reserveFixedAiCredits(
        {
          amount: reservationCredits,
          expiresInSeconds: RESERVATION_TTL_SECONDS,
          feature: CREDIT_FEATURE,
          metadata: { source: config.source, surface: config.surface },
          modelId: MODEL_ID,
          userId: context.user.id,
          wsId: normalizedWsId,
        },
        sbAdmin
      );
      if (!reservation.success || !reservation.reservationId) {
        return NextResponse.json(
          {
            error: 'AI credits insufficient',
            code: reservation.errorCode ?? 'CREDITS_EXHAUSTED',
          },
          { status: 403 }
        );
      }

      const reservationId = reservation.reservationId;
      let reservationState: 'reserved' | 'settling' | 'settled' = 'reserved';
      const releaseReservation = async (reason: string) => {
        if (reservationState !== 'reserved') return false;
        reservationState = 'settling';

        for (let attempt = 1; attempt <= 2; attempt += 1) {
          try {
            const released = await releaseFixedAiCreditReservation(
              reservationId,
              { reason, source: config.source, surface: config.surface },
              sbAdmin
            );
            if (released.success) {
              reservationState = 'settled';
              return true;
            }

            console.warn('Failed to release Teach credit reservation', {
              attempt,
              errorCode: released.errorCode,
              reason,
              reservationId,
            });
          } catch (error) {
            console.warn('Failed to release Teach credit reservation', {
              attempt,
              error,
              reason,
              reservationId,
            });
          }
        }

        // A later cleanup path may retry, and the database reservation remains
        // reserved until its TTL rather than being mistaken for settled.
        reservationState = 'reserved';
        return false;
      };

      try {
        const handleStreamError = async (error: unknown) => {
          console.error('Teach object-generation stream failed', {
            error,
            source: config.source,
            userId: context.user.id,
            wsId: normalizedWsId,
          });
          await releaseReservation('stream_error');
        };
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
          prompt,
          output: Output.object({ schema: config.outputSchema }),
          ...(cappedMaxOutput ? { maxOutputTokens: cappedMaxOutput } : {}),
          onFinish: async ({ usage }) => {
            if (reservationState !== 'reserved') return;
            reservationState = 'settling';
            const settled = await settleReservation(sbAdmin, {
              inputTokens: usage.inputTokens ?? 0,
              metadata: { source: config.source, surface: config.surface },
              outputTokens: usage.outputTokens ?? 0,
              reasoningTokens: usage.outputTokenDetails?.reasoningTokens ?? 0,
              reservationId,
              userId: context.user.id,
              wsId: normalizedWsId,
            });

            if (!settled) {
              console.warn('Failed to settle Teach credit reservation', {
                reservationId,
                source: config.source,
                userId: context.user.id,
                wsId: normalizedWsId,
              });
              reservationState = 'reserved';
              await releaseReservation('settlement_failed');
              return;
            }
            reservationState = 'settled';
          },
          onError: ({ error }) => handleStreamError(error),
          providerOptions: {
            google: { safetySettings: SAFETY_SETTINGS },
          },
        });

        // Remove client backpressure so onFinish and its awaited credit settlement
        // complete even if the browser disconnects from the response stream.
        void result.consumeStream({
          onError: (error) => {
            void handleStreamError(error);
          },
        });

        const response = createTextStreamResponse({
          stream: createObjectTextStream(result.stream),
        });
        return new NextResponse(response.body, {
          headers: response.headers,
          status: response.status,
          statusText: response.statusText,
        });
      } catch (error) {
        await releaseReservation('provider_start_error');
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
