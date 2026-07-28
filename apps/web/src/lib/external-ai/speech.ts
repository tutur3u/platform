import { AiStudioError, toOpenAiError } from '@tuturuuu/ai/studio/errors';
import {
  beginExternalAiStudioRun,
  calculateAiStudioUsageCost,
  settleExternalAiStudioRun,
} from '@tuturuuu/ai/studio/metering';
import { getAiStudioRequestId } from '@tuturuuu/ai/studio/request';
import { z } from 'zod';
import { authenticateExternalAiRequest, EXTERNAL_TTS_SCOPE } from './auth';

const SAMPLE_RATE = 24_000;
const GOOGLE_TTS_URL =
  'https://generativelanguage.googleapis.com/v1beta/interactions';
const DEFAULT_GOOGLE_TTS_MODEL = 'gemini-3.1-flash-tts-preview';
const TRANSIENT_PROVIDER_STATUSES = new Set([429, 500, 502, 503, 504]);

const requestSchema = z.object({
  input: z.string().trim().min(1).max(10_000),
  instructions: z.string().trim().max(2_000).optional(),
  language: z.string().trim().min(2).max(16).default('vi'),
  model: z.string().trim().min(1).optional(),
  response_format: z.enum(['pcm', 'wav']).default('wav'),
  voice: z
    .string()
    .trim()
    .regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/u)
    .default('Kore'),
});

function approximateTokenCount(value: string) {
  return Math.max(1, Math.ceil(value.length / 4));
}

function pcmToWav(pcm: Buffer) {
  const header = Buffer.alloc(44);
  const byteRate = SAMPLE_RATE * 2;

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);

  return Buffer.concat([header, pcm]);
}

function audioDataFromRecord(record: Record<string, unknown>, key: string) {
  const value = record[key];
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const audio = value as Record<string, unknown>;
  return typeof audio.data === 'string' ? audio.data : null;
}

function findBase64AudioData(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findBase64AudioData(item);
      if (found) return found;
    }
    return null;
  }

  const record = value as Record<string, unknown>;
  const direct =
    audioDataFromRecord(record, 'audio') ??
    audioDataFromRecord(record, 'audioData') ??
    audioDataFromRecord(record, 'output_audio') ??
    audioDataFromRecord(record, 'outputAudio');
  if (direct) return direct;

  const inlineData = record.inlineData ?? record.inline_data;
  if (
    inlineData &&
    typeof inlineData === 'object' &&
    !Array.isArray(inlineData)
  ) {
    const data = (inlineData as Record<string, unknown>).data;
    if (typeof data === 'string') return data;
  }

  const data = record.data;
  const mediaType = record.mimeType ?? record.mime_type ?? record.type;
  if (
    typeof data === 'string' &&
    typeof mediaType === 'string' &&
    mediaType.toLowerCase().includes('audio')
  ) {
    return data;
  }

  for (const child of Object.values(record)) {
    const found = findBase64AudioData(child);
    if (found) return found;
  }

  return null;
}

async function providerErrorDetails(response: Response) {
  const fallback = {
    code: undefined as number | string | undefined,
    message: undefined as string | undefined,
    status: undefined as string | undefined,
  };

  try {
    const payload = (await response.json()) as {
      error?: {
        code?: number | string;
        message?: string;
        status?: string;
      };
    };
    const error = payload.error;

    return {
      code: error?.code,
      message: error?.message?.slice(0, 300),
      status: error?.status,
    };
  } catch {
    return fallback;
  }
}

async function requestGoogleSpeech({
  apiKey,
  body,
  fetchImpl,
  signal,
}: {
  apiKey: string;
  body: string;
  fetchImpl: typeof fetch;
  signal: AbortSignal;
}) {
  let providerResponse: Response | undefined;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    providerResponse = await fetchImpl(GOOGLE_TTS_URL, {
      body,
      headers: {
        'Api-Revision': '2026-05-20',
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      method: 'POST',
      signal,
    });

    if (
      providerResponse.ok ||
      !TRANSIENT_PROVIDER_STATUSES.has(providerResponse.status) ||
      attempt === 2
    ) {
      return providerResponse;
    }
  }

  if (!providerResponse) {
    throw new Error('Google TTS request did not produce a response.');
  }

  return providerResponse;
}

export async function executeExternalSpeech(
  request: Request,
  fetchImpl: typeof fetch = fetch
) {
  let runId: string | undefined;
  const startedAt = Date.now();
  let requestId: string | undefined;

  try {
    const input = requestSchema.parse(await request.json());
    const credential = await authenticateExternalAiRequest(
      request,
      EXTERNAL_TTS_SCOPE
    );
    requestId = getAiStudioRequestId(request);
    const requestedModel = input.model ?? `google/${DEFAULT_GOOGLE_TTS_MODEL}`;
    if (!requestedModel.startsWith('google/')) {
      throw new AiStudioError(
        'Only approved Google TTS models are available.',
        {
          code: 'model_not_found',
          status: 404,
        }
      );
    }
    const model = requestedModel.slice('google/'.length);
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
    if (!apiKey) {
      throw new AiStudioError('Tuturuuu speech generation is not configured.', {
        code: 'server_error',
        status: 503,
        type: 'server_error',
      });
    }

    const reservation = await beginExternalAiStudioRun({
      actorId: credential.actorId,
      externalAppId: credential.appId,
      feature: 'text_to_speech',
      metadata: {
        language: input.language,
        provider_route: 'tuturuuu-web-google',
        response_format: input.response_format,
        voice: input.voice,
      },
      modelId: requestedModel,
      requestId,
      workspaceId: credential.workspaceId,
    });
    runId = reservation.runId;

    const providerResponse = await requestGoogleSpeech({
      apiKey,
      body: JSON.stringify({
        generation_config: {
          speech_config: [{ voice: input.voice }],
        },
        input: [
          input.instructions ??
            'Đọc tiếng Việt tự nhiên, rõ ràng và trôi chảy. Chỉ đọc nội dung, không thêm lời dẫn.',
          '',
          input.input,
        ].join('\n'),
        model,
        response_format: { type: 'audio' },
      }),
      fetchImpl,
      signal: request.signal,
    });

    if (!providerResponse.ok) {
      const providerError = await providerErrorDetails(providerResponse);
      console.error('Google TTS provider rejected the request', {
        providerCode: providerError.code,
        providerMessage: providerError.message,
        providerStatus: providerError.status,
        status: providerResponse.status,
      });
      throw new AiStudioError('The speech provider rejected the request.', {
        code: 'server_error',
        status: 502,
        type: 'server_error',
      });
    }

    const encodedAudio = findBase64AudioData(await providerResponse.json());
    if (!encodedAudio) {
      throw new AiStudioError(
        'The speech response did not contain audio data.',
        {
          code: 'server_error',
          status: 502,
          type: 'server_error',
        }
      );
    }

    const pcm = Buffer.from(encodedAudio, 'base64');
    const inputTokens = approximateTokenCount(input.input);
    const outputTokens = Math.max(
      1,
      Math.ceil((pcm.length / (SAMPLE_RATE * 2)) * 25)
    );
    const cost = await calculateAiStudioUsageCost({
      inputTokens,
      modelId: requestedModel,
      outputTokens,
      workspaceId: credential.workspaceId,
    }).catch(() => ({ billedCredits: 0, providerCostUsd: 0 }));
    await settleExternalAiStudioRun({
      inputTokens,
      latencyMs: Date.now() - startedAt,
      outputTokens,
      providerCostUsd: cost.providerCostUsd,
      runId,
      status: 'succeeded',
    });

    const audio = input.response_format === 'wav' ? pcmToWav(pcm) : pcm;
    return new Response(audio, {
      headers: {
        'cache-control': 'no-store',
        'content-disposition': `attachment; filename="speech.${input.response_format}"`,
        'content-type':
          input.response_format === 'pcm'
            ? 'audio/L16;rate=24000;channels=1'
            : 'audio/wav',
        'x-request-id': requestId,
      },
    });
  } catch (error) {
    if (runId) {
      await settleExternalAiStudioRun({
        errorClass: error instanceof Error ? error.name : typeof error,
        errorMessage:
          error instanceof Error ? error.message.slice(0, 500) : null,
        latencyMs: Date.now() - startedAt,
        runId,
        status: request.signal.aborted ? 'aborted' : 'failed',
      }).catch(() => undefined);
    }

    const normalizedError =
      error instanceof z.ZodError
        ? new AiStudioError(error.issues[0]?.message ?? 'Invalid request.', {
            code: 'invalid_request_error',
            status: 400,
          })
        : error;
    console.error('External-app speech request failed', {
      code:
        normalizedError instanceof AiStudioError
          ? normalizedError.code
          : 'server_error',
      errorClass:
        normalizedError instanceof Error
          ? normalizedError.name
          : typeof normalizedError,
      requestId,
    });
    return toOpenAiError(normalizedError, requestId);
  }
}
