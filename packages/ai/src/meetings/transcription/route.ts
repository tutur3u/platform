import { google } from '@ai-sdk/google';
import { createClient } from '@tuturuuu/supabase/next/server';
import { getRateLimiters } from '@tuturuuu/utils/api-proxy-rate-limiters';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { generateObject } from 'ai';
import { z } from 'zod';
import { checkAiCredits, deductAiCredits } from '../../credits/check-credits';
import { withAiMemory } from '../../memory';
import {
  estimateRecordingSeconds,
  MEET_AI_LIMITER_RETRY_AFTER_SECONDS,
  type MeetAiUsageDecision,
  type MeetAiUsageInput,
} from '../usage-limit';
import {
  hasOversizedDeclaredContentLength,
  validateTranscriptionAudioFile,
} from './input';

const DEFAULT_MODEL_NAME = 'gemini-3.1-flash-lite';

const transcriptSchema = z.object({
  text: z.string().describe('The full transcript text'),
  segments: z
    .array(
      z.object({
        text: z.string().describe('Text content of this segment'),
        start: z.number().describe('Start time in seconds'),
        end: z.number().describe('End time in seconds'),
      })
    )
    .optional()
    .describe('Array of transcript segments with timestamps'),
  language: z
    .string()
    .optional()
    .describe('Detected language code (e.g. "en", "vi")'),
  durationInSeconds: z
    .number()
    .optional()
    .describe('Total audio duration in seconds'),
});

export type MeetingTranscriptionOptions = {
  /**
   * Meet AI default-deny workspace gate, injected by the framework adapter
   * (the allowlist binding lives in the runtime env, which this portable
   * package must not read). Omitted means deny.
   */
  isMeetAiEnabled?: (wsId: string) => boolean | Promise<boolean>;
  /**
   * Fail-closed Meet AI usage limiter (`meet` abuse-guard family), injected by
   * the framework adapter so server-only env stays out of this package.
   * Omitted, throwing or refusing means no provider call.
   */
  limitMeetAiUsage?: (input: MeetAiUsageInput) => Promise<MeetAiUsageDecision>;
};

const RATE_LIMIT_UNAVAILABLE_RETRY_AFTER_SECONDS = 30;

async function meetAiAllowed(
  wsId: string,
  isMeetAiEnabled: MeetingTranscriptionOptions['isMeetAiEnabled']
) {
  if (!isMeetAiEnabled) return false;
  try {
    return (await isMeetAiEnabled(wsId)) === true;
  } catch {
    return false;
  }
}

async function meetAiUsageDecision(
  limit: MeetingTranscriptionOptions['limitMeetAiUsage'],
  input: MeetAiUsageInput
): Promise<MeetAiUsageDecision> {
  const unavailable: MeetAiUsageDecision = {
    ok: false,
    status: 503,
    code: 'MEET_AI_LIMITER_UNAVAILABLE',
    retryAfterSeconds: MEET_AI_LIMITER_RETRY_AFTER_SECONDS,
    reason: limit ? 'error' : 'not_configured',
  };
  if (!limit) return unavailable;
  try {
    const decision = await limit(input);
    return decision?.ok === true || decision?.ok === false
      ? decision
      : unavailable;
  } catch {
    return unavailable;
  }
}

export function createPOST({
  isMeetAiEnabled,
  limitMeetAiUsage,
}: MeetingTranscriptionOptions = {}) {
  return async function handler(req: Request) {
    try {
      const supabase = await createClient();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        console.error('Unauthorized');
        return new Response('Unauthorized', { status: 401 });
      }

      if (hasOversizedDeclaredContentLength(req)) {
        return new Response('Audio file too large', { status: 413 });
      }

      // Fail closed: a missing or erroring limiter store must not skip the
      // limit in front of a paid provider call.
      let limiters: Awaited<ReturnType<typeof getRateLimiters>>;
      try {
        limiters = await getRateLimiters('ai:meeting-transcription', {
          get: [],
          mutate: [{ duration: '1 m', limit: 10, window: 'minute' }],
        });
      } catch {
        limiters = null;
      }
      const buckets = limiters?.mutate ?? [];
      const rateLimitUnavailable = () => {
        console.error('Meeting transcription rate limiter unavailable');
        return new Response('Service temporarily unavailable', {
          status: 503,
          headers: {
            'Retry-After': String(RATE_LIMIT_UNAVAILABLE_RETRY_AFTER_SECONDS),
          },
        });
      };
      if (buckets.length === 0) return rateLimitUnavailable();
      for (const { limiter } of buckets) {
        let result: Awaited<ReturnType<typeof limiter.limit>>;
        try {
          result = await limiter.limit(user.id);
        } catch {
          return rateLimitUnavailable();
        }
        if (!result.success) {
          return new Response('Too many requests', {
            status: 429,
            headers: {
              'Retry-After': String(
                Math.max(1, Math.ceil((result.reset - Date.now()) / 1000))
              ),
            },
          });
        }
      }

      const formData = await req.formData();
      const audioFile = formData.get('audio');
      const rawWsId = formData.get('wsId');
      if (typeof rawWsId !== 'string' || !rawWsId.trim()) {
        return new Response('Workspace ID is required', { status: 400 });
      }

      let wsId: string;
      try {
        wsId = await normalizeWorkspaceId(rawWsId.trim(), supabase);
      } catch {
        return new Response('Workspace access denied', { status: 403 });
      }
      if (!z.uuid().safeParse(wsId).success) {
        return new Response('Workspace access denied', { status: 403 });
      }
      const meetingId = formData.get('meetingId');
      if (
        !z.uuid().safeParse(meetingId).success ||
        typeof meetingId !== 'string'
      ) {
        return new Response('Meeting ID is required', { status: 400 });
      }
      const { data: meeting, error: meetingError } = await supabase
        .from('workspace_meetings')
        .select('ws_id')
        .eq('id', meetingId)
        .maybeSingle();
      if (meetingError) {
        return new Response('Meeting lookup unavailable', { status: 503 });
      }
      if (!meeting || meeting.ws_id !== wsId) {
        return new Response('Meeting access denied', { status: 403 });
      }
      wsId = meeting.ws_id;
      const membership = await verifyWorkspaceMembershipType({
        wsId,
        userId: user.id,
        supabase,
        requiredType: 'MEMBER',
      });
      if (!membership.ok) {
        return new Response('Workspace access denied', { status: 403 });
      }

      if (!(await meetAiAllowed(wsId, isMeetAiEnabled))) {
        return new Response('Meet AI is temporarily unavailable', {
          status: 403,
        });
      }

      if (!(audioFile instanceof File)) {
        return new Response('No audio file provided', { status: 400 });
      }

      const validation = validateTranscriptionAudioFile(audioFile);
      if (!validation.ok) {
        return new Response(validation.message, { status: validation.status });
      }

      // Per-user, per-meeting and per-workspace daily audio limits, charged
      // with a conservative duration estimate before the credit check and
      // the provider call. Fails closed (503) when the limiter cannot decide.
      const usage = await meetAiUsageDecision(limitMeetAiUsage, {
        kind: 'recording',
        userId: user.id,
        meetingId,
        workspaceId: wsId,
        audioSeconds: Math.max(1, estimateRecordingSeconds(audioFile.size)),
      });
      if (!usage.ok) {
        return Response.json(
          {
            error:
              usage.status === 429
                ? 'Meeting AI usage limit reached; try again later'
                : 'Meeting AI usage limiter is unavailable',
            code: usage.code,
          },
          {
            status: usage.status,
            headers: { 'Retry-After': String(usage.retryAfterSeconds) },
          }
        );
      }

      const creditCheck = await checkAiCredits(
        wsId,
        DEFAULT_MODEL_NAME,
        'generate',
        {
          userId: user.id,
        }
      );
      if (!creditCheck.allowed) {
        return Response.json(
          {
            error:
              creditCheck.errorCode === 'CREDITS_EXHAUSTED'
                ? 'The meeting workspace is out of AI credits'
                : 'AI credits unavailable for the meeting workspace',
            code: creditCheck.errorCode,
          },
          { status: 402 }
        );
      }

      // Convert file to buffer
      const audioBuffer = await audioFile.arrayBuffer();
      const audioUint8Array = new Uint8Array(audioBuffer);

      const result = await generateObject({
        model: await withAiMemory({
          addMemory: 'never',
          customId: `meeting-transcription-${Date.now()}`,
          model: google(DEFAULT_MODEL_NAME),
          product: 'meetings',
          source: 'meeting_transcription',
          surface: 'meeting_transcription',
          userId: user.id,
          wsId,
        }),
        schema: transcriptSchema,
        system: systemInstruction,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'file',
                mediaType: validation.mediaType,
                data: audioUint8Array,
              },
            ],
          },
        ],
        providerOptions: {
          google: {
            safetySettings: [
              {
                category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
                threshold: 'BLOCK_NONE',
              },
              {
                category: 'HARM_CATEGORY_HATE_SPEECH',
                threshold: 'BLOCK_NONE',
              },
              {
                category: 'HARM_CATEGORY_HARASSMENT',
                threshold: 'BLOCK_NONE',
              },
              {
                category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
                threshold: 'BLOCK_NONE',
              },
            ],
          },
        },
      });

      const deduction = await deductAiCredits({
        wsId,
        userId: user.id,
        modelId: DEFAULT_MODEL_NAME,
        feature: 'generate',
        inputTokens: result.usage.inputTokens ?? 0,
        outputTokens: result.usage.outputTokens ?? 0,
        reasoningTokens: result.usage.outputTokenDetails?.reasoningTokens ?? 0,
      });
      if (!deduction.success) {
        console.error('Meeting transcription credit deduction failed');
        return new Response('Unable to record AI usage', { status: 500 });
      }

      return new Response(
        JSON.stringify({
          text: result.object.text,
          segments: result.object.segments,
          language: result.object.language,
          durationInSeconds: result.object.durationInSeconds,
        }),
        {
          headers: { 'Content-Type': 'application/json' },
        }
      );
    } catch (error) {
      console.error('Transcription error:', error);
      return new Response('Internal server error', { status: 500 });
    }
  };
}

const systemInstruction = `
  You are a helpful assistant that transcribes audio into structured text with timestamps.

  Please analyze the audio and provide:
  1. The complete transcript text
  2. If possible, break it into segments with start and end timestamps (in seconds)
  3. Detect the language used in the audio
  4. Estimate the total duration of the audio

  Return the result in the specified JSON schema format.
`;
