import { meetingProviderTransport } from './provider-transport';
import 'server-only';
import { generateMeetArtifact } from '@tuturuuu/ai/meetings/gemini';
import { geminiSttProvider } from '@tuturuuu/ai/meetings/stt-provider';
import { MEET_AI_MODEL, MEET_AI_PRICING } from '@tuturuuu/ai/meetings/usage';
import {
  beginAiStudioRun,
  recordAiStudioRunStep,
  settleAiStudioRun,
} from '@tuturuuu/ai/studio/metering';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { Effect } from '@tuturuuu/utils/effect';
import { z } from 'zod';
import { MEETING_APP } from '../../../runtime';
import { MeetAiError } from './access';
import { admitMeetCredits, type MeetCreditAdmission } from './credit-admission';
import {
  BILLING_UNRECONCILED,
  isDefinitiveProviderRejection,
  markBillingUnknown,
  markSettledUncharged,
} from './notes-billing';

type Input = Parameters<typeof generateMeetArtifact>[0];

/** Everything needed to settle a run again without the provider output. */
export type MeetRunSettlement = {
  runId: string;
  actualCredits: number;
  providerCostUsd: number;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  metadata: {
    app: string;
    source: string;
    meetingId: string;
    operation: string;
  };
};

/**
 * Settling a run that is already terminal succeeds without charging again
 * (private.settle_ai_studio_run), so this is safe to repeat during recovery.
 */
export async function settleMeetRun(settlement: MeetRunSettlement) {
  await Effect.runPromise(
    Effect.retry(
      Effect.tryPromise(() =>
        settleAiStudioRun({
          runId: settlement.runId,
          status: 'succeeded',
          actualCredits: settlement.actualCredits,
          providerCostUsd: settlement.providerCostUsd,
          inputTokens: settlement.inputTokens,
          outputTokens: settlement.outputTokens,
          latencyMs: settlement.latencyMs,
          metadata: { ...settlement.metadata, usage_source: 'provider' },
        })
      ),
      { times: 2 }
    )
  );
}

/**
 * The provider executes once; settlement retries reuse the same central run.
 *
 * `hooks.onGenerated` runs after the provider output is measured and BEFORE the
 * charge is settled, so a caller can durably keep the output and the run
 * reference. If it throws, nothing is charged and the run stays pending for
 * reconciliation; the same idempotency key then refuses another run.
 */
export async function generateBilledMeetArtifact(
  input: Input,
  actor: {
    userId: string;
    meetingId: string;
    attemptId: string;
  },
  admission?: MeetCreditAdmission,
  hooks?: {
    onGenerated?: (generated: {
      measured: Awaited<ReturnType<typeof generateMeetArtifact>>;
      settlement: MeetRunSettlement;
    }) => Promise<void>;
  }
) {
  const { workspaceId, allowance } =
    admission ?? (await admitMeetCredits(actor.userId));
  const modelId = `google/${MEET_AI_MODEL}`;
  const db = await createAdminClient({ noCookie: true });
  const { data: allocation, error } = await db
    .from('ai_credit_plan_allocations')
    .select('markup_multiplier')
    .eq(
      'tier',
      z.enum(['FREE', 'PLUS', 'PRO', 'ENTERPRISE']).parse(allowance.tier)
    )
    .eq('is_active', true)
    .single();
  const markup = Number(allocation?.markup_multiplier);
  if (error || !Number.isFinite(markup) || markup <= 0)
    throw new MeetAiError(503, 'AI pricing unavailable');
  const maxOutputTokens = Math.min(8192, allowance.maxOutputTokens ?? 8192);
  if (maxOutputTokens < 1)
    throw new MeetAiError(402, 'AI output allowance unavailable');
  const audioBytes =
    'audio' in input
      ? input.audio.byteLength
      : 'audioSegments' in input
        ? input.audioSegments.reduce((sum, bytes) => sum + bytes.byteLength, 0)
        : 0;
  // Conservative bounds: PCM16 at 16 kHz, 100 input tokens per audio second;
  // text reserves one token per character plus the provider's fixed instructions.
  const inputBound =
    ('transcript' in input
      ? input.transcript.length
      : Math.ceil((audioBytes / 32000) * 100)) + 2048;
  const inputPrice =
    'transcript' in input ? MEET_AI_PRICING.text : MEET_AI_PRICING.audio;
  const reservedCredits = Math.max(
    1,
    Math.ceil(
      ((inputBound * inputPrice + maxOutputTokens * MEET_AI_PRICING.output) /
        100) *
        markup
    )
  );
  const metadata = {
    app: MEETING_APP,
    source: `${MEETING_APP}_artifact`,
    meetingId: actor.meetingId,
    operation: 'transcript' in input ? 'meeting_notes' : 'transcription',
  };
  const run = await beginAiStudioRun({
    actorId: actor.userId,
    workspaceId,
    modelId,
    feature: 'generate',
    reservedCredits,
    requestId: actor.attemptId,
    idempotencyKey: actor.attemptId,
    rejectExisting: true,
    metadata,
  });
  const started = Date.now();
  let measured: Awaited<ReturnType<typeof generateMeetArtifact>> | undefined;
  try {
    const options = {
      maxOutputTokens,
      provider: await meetingProviderTransport(),
    };
    measured =
      'audioSegments' in input
        ? await geminiSttProvider.transcribeBatch(
            input.audioSegments,
            input.hints,
            options
          )
        : await generateMeetArtifact(input, options);
  } catch (error) {
    const definitive = isDefinitiveProviderRejection(error);
    try {
      await settleAiStudioRun({
        runId: run.runId,
        status: 'failed',
        actualCredits: 0,
        errorClass: 'provider_failed',
        metadata: { ...metadata, usage_source: 'unavailable' },
      });
    } catch {
      // The failure is not recorded, so what the provider did is unknown. Never
      // report it as a clean failure: the run stays pending for reconciliation.
      throw new MeetAiError(
        503,
        'AI usage settlement unavailable',
        BILLING_UNRECONCILED
      );
    }
    // Rotation needs a definitive refusal AND a recorded failed settlement.
    // Anything else may have cost real provider work: keep the identity.
    throw definitive ? markSettledUncharged(error) : markBillingUnknown(error);
  }
  if (!measured.usage.available || measured.costUsd === null) {
    // Do not manufacture a bill from an estimate. The reservation and pending
    // run remain visible for reconciliation instead of returning unmetered output.
    throw new MeetAiError(
      503,
      'AI usage accounting unavailable',
      BILLING_UNRECONCILED
    );
  }
  const actualCredits =
    measured.costUsd === 0
      ? 0
      : Math.max(1, (measured.costUsd / 0.0001) * markup);
  const settlement: MeetRunSettlement = {
    runId: run.runId,
    actualCredits,
    providerCostUsd: measured.costUsd ?? 0,
    inputTokens: measured.usage.inputTokens ?? 0,
    outputTokens: measured.usage.outputTokens ?? 0,
    latencyMs: Date.now() - started,
    metadata,
  };
  await hooks?.onGenerated?.({ measured, settlement });
  await settleMeetRun(settlement);
  await recordAiStudioRunStep({
    runId: run.runId,
    sequence: 0,
    kind: 'model',
    name: metadata.operation,
    status: 'succeeded',
    modelId,
    billedCredits: actualCredits,
    providerCostUsd: measured.costUsd,
    inputTokens: measured.usage.inputTokens ?? 0,
    outputTokens: measured.usage.outputTokens ?? 0,
    latencyMs: Date.now() - started,
    metadata: { app: MEETING_APP, usage_source: 'provider' },
  }).catch(() => {
    console.warn('Meeting AI run step recording pending', { runId: run.runId });
  });
  return measured;
}
