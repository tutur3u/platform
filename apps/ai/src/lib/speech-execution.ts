import { AiStudioError } from '@tuturuuu/ai/studio/errors';
import { z } from 'zod';
import {
  approximateTokenCount,
  prepareMeteredExecution,
  publicApiError,
  settleMeteredExecution,
} from './public-api';
import { EXTERNAL_TTS_SCOPE } from './public-credential';

const SAMPLE_RATE = 24_000;
const TTS_TIMEOUT_MS = 30_000;
export const DEFAULT_GOOGLE_TTS_MODEL = 'gemini-3.1-flash-tts-preview';

export const speechRequestSchema = z.object({
  input: z.string().trim().min(1).max(10_000),
  model: z.string().trim().min(1).optional(),
  response_format: z.enum(['pcm', 'wav']).default('wav'),
  voice: z
    .string()
    .trim()
    .regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/u)
    .default('Kore'),
});

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

  for (const child of Object.values(record)) {
    const found = findBase64AudioData(child);
    if (found) return found;
  }

  return null;
}

export async function executeSpeechRequest(
  request: Request,
  input: z.infer<typeof speechRequestSchema>
): Promise<Response> {
  let context: Awaited<ReturnType<typeof prepareMeteredExecution>> | undefined;
  const configuredModel =
    process.env.GOOGLE_TTS_MODEL ?? DEFAULT_GOOGLE_TTS_MODEL;
  const requestedModel = input.model ?? configuredModel;
  const normalizedModel = requestedModel.startsWith('google/')
    ? requestedModel.slice('google/'.length)
    : requestedModel;

  try {
    if (normalizedModel !== configuredModel) {
      throw new AiStudioError('The requested speech model is not available.', {
        code: 'model_not_found',
        status: 404,
      });
    }

    const apiKey =
      process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new AiStudioError('Speech generation is not configured.', {
        code: 'server_error',
        status: 503,
        type: 'server_error',
      });
    }

    const modelId = `google/${normalizedModel}`;
    const estimatedInputTokens = approximateTokenCount(input.input);
    context = await prepareMeteredExecution({
      feature: 'text_to_speech',
      maxUsage: {
        inputTokens: estimatedInputTokens,
        outputTokens: Math.max(25, input.input.length * 2),
      },
      metadata: {
        response_format: input.response_format,
        voice: input.voice,
      },
      modelId,
      request,
      requiredExternalScope: EXTERNAL_TTS_SCOPE,
    });

    const controller = new AbortController();
    const abort = () => controller.abort();
    request.signal.addEventListener('abort', abort, { once: true });
    const timeout = setTimeout(abort, TTS_TIMEOUT_MS);
    let providerResponse: Response;

    try {
      providerResponse = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/interactions',
        {
          body: JSON.stringify({
            generation_config: {
              speech_config: [{ voice: input.voice }],
            },
            input: input.input,
            model: normalizedModel,
            response_format: { type: 'audio' },
          }),
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          method: 'POST',
          signal: controller.signal,
        }
      );
    } finally {
      clearTimeout(timeout);
      request.signal.removeEventListener('abort', abort);
    }

    if (!providerResponse.ok) {
      throw new AiStudioError('The speech provider rejected the request.', {
        code: 'server_error',
        status: 502,
        type: 'server_error',
      });
    }

    const payload = await providerResponse.json();
    const encodedAudio = findBase64AudioData(payload);
    if (!encodedAudio) {
      throw new AiStudioError('The speech response did not contain audio.', {
        code: 'server_error',
        status: 502,
        type: 'server_error',
      });
    }

    const pcm = Buffer.from(encodedAudio, 'base64');
    const outputTokens = Math.max(
      1,
      Math.ceil((pcm.length / (SAMPLE_RATE * 2)) * 25)
    );
    await settleMeteredExecution(context, {
      status: 'succeeded',
      usage: {
        inputTokens: estimatedInputTokens,
        outputTokens,
      },
    });

    const audio = input.response_format === 'pcm' ? pcm : pcmToWav(pcm);
    return new Response(audio, {
      headers: {
        'cache-control': 'no-store',
        'content-disposition': `attachment; filename="speech.${input.response_format}"`,
        'content-type':
          input.response_format === 'pcm'
            ? 'audio/L16;rate=24000;channels=1'
            : 'audio/wav',
        'x-request-id': context.requestId,
      },
    });
  } catch (error) {
    if (context) {
      await settleMeteredExecution(context, {
        error,
        status: request.signal.aborted ? 'aborted' : 'failed',
        usage: {},
      }).catch(() => undefined);
    }
    return publicApiError(
      error instanceof z.ZodError
        ? new AiStudioError(error.issues[0]?.message ?? 'Invalid request.', {
            code: 'invalid_request_error',
            status: 400,
          })
        : error,
      context?.requestId
    );
  }
}
