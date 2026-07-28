import { google } from '@ai-sdk/google';
import { AiStudioError, toOpenAiError } from '@tuturuuu/ai/studio/errors';
import {
  beginExternalAiStudioRun,
  calculateAiStudioUsageCost,
  settleExternalAiStudioRun,
} from '@tuturuuu/ai/studio/metering';
import {
  getAiStudioRequestId,
  getIdempotencyKey,
} from '@tuturuuu/ai/studio/request';
import {
  generateText,
  jsonSchema,
  type LanguageModelUsage,
  Output,
  streamText,
} from 'ai';
import { z } from 'zod';
import { authenticateExternalAiRequest } from './auth';

const messageSchema = z.object({
  content: z.union([
    z.string(),
    z.array(
      z.object({
        text: z.string().optional(),
        type: z.string(),
      })
    ),
  ]),
  role: z.enum(['assistant', 'developer', 'system', 'user']),
});

const responseFormatSchema = z
  .object({
    json_schema: z
      .object({
        name: z.string().optional(),
        schema: z.record(z.string(), z.unknown()),
        strict: z.boolean().optional(),
      })
      .optional(),
    type: z.enum(['json_object', 'json_schema', 'text']),
  })
  .optional();

const requestSchema = z.object({
  max_completion_tokens: z.number().int().min(1).max(32_768).optional(),
  max_tokens: z.number().int().min(1).max(32_768).optional(),
  messages: z.array(messageSchema).min(1),
  model: z.string().trim().min(1).max(200),
  response_format: responseFormatSchema,
  stream: z.boolean().default(false),
  temperature: z.number().min(0).max(2).optional(),
});

function messageText(content: z.infer<typeof messageSchema>['content']) {
  return typeof content === 'string'
    ? content
    : content
        .filter((part) => part.type === 'text' && part.text)
        .map((part) => part.text)
        .join('\n');
}

function normalizeMessages(messages: z.infer<typeof messageSchema>[]) {
  const instructions = messages
    .filter(
      (message) => message.role === 'system' || message.role === 'developer'
    )
    .map((message) => messageText(message.content))
    .filter(Boolean)
    .join('\n\n');
  const prompt = messages
    .filter(
      (message) => message.role !== 'system' && message.role !== 'developer'
    )
    .map(
      (message) =>
        `${message.role}: ${messageText(message.content).trim() || '(empty)'}`
    )
    .join('\n\n');

  return { instructions, prompt };
}

function bareGoogleModel(modelId: string) {
  if (!modelId.startsWith('google/')) {
    throw new AiStudioError('Only approved Google models are available.', {
      code: 'model_not_found',
      status: 404,
    });
  }
  return modelId.slice('google/'.length);
}

function usageValues(usage: LanguageModelUsage) {
  return {
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
    reasoningTokens: usage.outputTokenDetails?.reasoningTokens ?? 0,
  };
}

function commonHeaders(requestId: string) {
  return {
    'cache-control': 'no-store',
    'x-request-id': requestId,
  };
}

async function settleSucceeded({
  modelId,
  runId,
  startedAt,
  usage,
  workspaceId,
}: {
  modelId: string;
  runId: string;
  startedAt: number;
  usage: ReturnType<typeof usageValues>;
  workspaceId: string;
}) {
  const cost = await calculateAiStudioUsageCost({
    inputTokens: usage.inputTokens,
    modelId,
    outputTokens: usage.outputTokens,
    reasoningTokens: usage.reasoningTokens,
    workspaceId,
  }).catch(() => ({ billedCredits: 0, providerCostUsd: 0 }));

  await settleExternalAiStudioRun({
    inputTokens: usage.inputTokens,
    latencyMs: Date.now() - startedAt,
    outputTokens: usage.outputTokens,
    providerCostUsd: cost.providerCostUsd,
    reasoningTokens: usage.reasoningTokens,
    runId,
    status: 'succeeded',
  });
}

export async function executeExternalChatCompletion(request: Request) {
  let runId: string | undefined;
  const startedAt = Date.now();
  let requestId: string | undefined;

  try {
    const input = requestSchema.parse(await request.json());
    const credential = await authenticateExternalAiRequest(request);
    requestId = getAiStudioRequestId(request);
    const idempotencyKey = getIdempotencyKey(request);
    const normalized = normalizeMessages(input.messages);
    const structuredSchema = input.response_format?.json_schema?.schema;

    const reservation = await beginExternalAiStudioRun({
      actorId: credential.actorId,
      externalAppId: credential.appId,
      feature: 'chat_completions',
      idempotencyKey: idempotencyKey
        ? `${credential.appId}:${idempotencyKey}`
        : null,
      metadata: {
        provider_route: 'tuturuuu-web-google',
        response_format: input.response_format?.type ?? 'text',
        streaming: input.stream,
      },
      modelId: input.model,
      requestId,
      workspaceId: credential.workspaceId,
    });
    runId = reservation.runId;

    const common = {
      abortSignal: request.signal,
      maxOutputTokens: input.max_completion_tokens ?? input.max_tokens ?? 2_048,
      model: google(bareGoogleModel(input.model)),
      prompt: normalized.prompt,
      system: normalized.instructions || undefined,
      temperature: input.temperature,
    };

    if (!input.stream || structuredSchema) {
      const result = await generateText({
        ...common,
        ...(structuredSchema
          ? {
              output: Output.object({
                schema: jsonSchema<Record<string, unknown>>(structuredSchema),
              }),
            }
          : {}),
      });
      const usage = usageValues(result.usage);
      await settleSucceeded({
        modelId: input.model,
        runId,
        startedAt,
        usage,
        workspaceId: credential.workspaceId,
      });

      const text = structuredSchema
        ? JSON.stringify(result.output)
        : result.text;
      return Response.json(
        {
          choices: [
            {
              finish_reason: String(result.finishReason),
              index: 0,
              message: { content: text, role: 'assistant' },
            },
          ],
          created: Math.floor(Date.now() / 1_000),
          id: requestId,
          model: input.model,
          object: 'chat.completion',
          usage: {
            completion_tokens: usage.outputTokens,
            prompt_tokens: usage.inputTokens,
            total_tokens: usage.inputTokens + usage.outputTokens,
          },
        },
        { headers: commonHeaders(requestId) }
      );
    }

    const encoder = new TextEncoder();
    const result = streamText(common);
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const text of result.textStream) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  choices: [{ delta: { content: text }, index: 0 }],
                  created: Math.floor(Date.now() / 1_000),
                  id: requestId,
                  model: input.model,
                  object: 'chat.completion.chunk',
                })}\n\n`
              )
            );
          }

          await settleSucceeded({
            modelId: input.model,
            runId: runId!,
            startedAt,
            usage: usageValues(await result.usage),
            workspaceId: credential.workspaceId,
          });
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error) {
          await settleExternalAiStudioRun({
            errorClass: error instanceof Error ? error.name : typeof error,
            errorMessage:
              error instanceof Error ? error.message.slice(0, 500) : null,
            latencyMs: Date.now() - startedAt,
            runId: runId!,
            status: request.signal.aborted ? 'aborted' : 'failed',
          }).catch(() => undefined);
          controller.error(error);
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...commonHeaders(requestId),
        connection: 'keep-alive',
        'content-type': 'text/event-stream; charset=utf-8',
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
    console.error('External-app AI request failed', {
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
