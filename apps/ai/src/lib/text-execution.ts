import { AiStudioError } from '@tuturuuu/ai/studio/errors';
import type { Json } from '@tuturuuu/types';
import { z } from 'zod';
import { createObservedTextAgent } from './observed-text-agent';
import { playgroundToolNames } from './playground-tools';
import {
  approximateTokenCount,
  captureAiStudioContent,
  prepareMeteredExecution,
  publicApiError,
  settleMeteredExecution,
} from './public-api';

export const textRequestSchema = z.object({
  instructions: z.string().max(100_000).optional(),
  max_output_tokens: z.number().int().min(1).max(32_768).default(2_048),
  max_steps: z.number().int().min(1).max(8).default(4),
  model: z.string().min(1),
  prompt: z.string().min(1).max(1_000_000),
  stream: z.boolean().default(false),
  tools: z.array(z.enum(playgroundToolNames)).max(2).default([]),
});

type TextRequest = z.infer<typeof textRequestSchema>;

export function parseTextRequest(input: unknown): TextRequest {
  const parsed = textRequestSchema.safeParse(input);
  if (!parsed.success) {
    throw new AiStudioError(
      parsed.error.issues[0]?.message ?? 'Invalid request.',
      {
        code: 'invalid_request_error',
        status: 400,
      }
    );
  }
  return parsed.data;
}

function commonHeaders(requestId: string) {
  return {
    'cache-control': 'no-store',
    'x-request-id': requestId,
  };
}

export async function executeTextRequest(
  request: Request,
  input: TextRequest,
  {
    feature,
    responseShape,
  }: {
    feature: string;
    responseShape: 'chat' | 'responses';
  }
): Promise<Response> {
  let context: Awaited<ReturnType<typeof prepareMeteredExecution>> | undefined;

  try {
    context = await prepareMeteredExecution({
      feature,
      maxUsage: {
        inputTokens:
          approximateTokenCount(input.prompt) +
          approximateTokenCount(input.instructions),
        outputTokens: input.max_output_tokens,
      },
      metadata: {
        max_steps: input.max_steps,
        response_shape: responseShape,
        streaming: input.stream,
        tools: input.tools,
      },
      modelId: input.model,
      request,
    });

    const observed = createObservedTextAgent({
      context,
      instructions: input.instructions,
      maxOutputTokens: input.max_output_tokens,
      maxSteps: input.max_steps,
      modelId: input.model,
      signal: request.signal,
      toolNames: input.tools,
    });

    if (!input.stream) {
      const result = await observed.agent.generate({
        abortSignal: request.signal,
        prompt: input.prompt,
      });
      const usage = {
        inputTokens: result.usage.inputTokens ?? 0,
        outputTokens: result.usage.outputTokens ?? 0,
        reasoningTokens: result.usage.outputTokenDetails?.reasoningTokens ?? 0,
      };

      await Promise.all([
        settleMeteredExecution(context, {
          metadata: {
            finish_reason: String(result.finishReason),
            step_count: result.steps.length,
            tool_call_count: result.toolCalls.length,
            tool_names: [
              ...new Set(result.toolCalls.map((call) => call.toolName)),
            ],
          },
          status: 'succeeded',
          usage,
        }),
        captureAiStudioContent(context, {
          output: { text: result.text },
          prompt: {
            instructions: input.instructions,
            prompt: input.prompt,
          } as Json,
        }),
      ]);

      const created = Math.floor(Date.now() / 1000);
      const body =
        responseShape === 'chat'
          ? {
              choices: [
                {
                  finish_reason: String(result.finishReason),
                  index: 0,
                  message: { content: result.text, role: 'assistant' },
                },
              ],
              created,
              id: context.requestId,
              model: input.model,
              object: 'chat.completion',
              usage: {
                completion_tokens: usage.outputTokens,
                prompt_tokens: usage.inputTokens,
                total_tokens: usage.inputTokens + usage.outputTokens,
              },
              tuturuuu: { steps: observed.summaries() },
            }
          : {
              created_at: created,
              id: context.requestId,
              model: input.model,
              object: 'response',
              output: [
                {
                  content: [{ text: result.text, type: 'output_text' }],
                  id: `${context.requestId}_message`,
                  role: 'assistant',
                  type: 'message',
                },
              ],
              output_text: result.text,
              status: 'completed',
              usage: {
                input_tokens: usage.inputTokens,
                output_tokens: usage.outputTokens,
                total_tokens: usage.inputTokens + usage.outputTokens,
              },
              tuturuuu: { steps: observed.summaries() },
            };

      return Response.json(body, { headers: commonHeaders(context.requestId) });
    }

    const firstTokenStartedAt = Date.now();
    let firstTokenLatencyMs: number | null = null;
    let outputText = '';
    const result = await observed.agent.stream({
      abortSignal: request.signal,
      onEnd: async ({ finishReason, steps, text, toolCalls, usage }) => {
        outputText = text;
        await Promise.all([
          settleMeteredExecution(context!, {
            firstTokenLatencyMs,
            metadata: {
              finish_reason: String(finishReason),
              step_count: steps.length,
              tool_call_count: toolCalls.length,
              tool_names: [...new Set(toolCalls.map((call) => call.toolName))],
            },
            status: request.signal.aborted ? 'aborted' : 'succeeded',
            usage: {
              inputTokens: usage.inputTokens ?? 0,
              outputTokens: usage.outputTokens ?? 0,
              reasoningTokens: usage.outputTokenDetails?.reasoningTokens ?? 0,
            },
          }),
          captureAiStudioContent(context!, {
            output: { text },
            prompt: {
              instructions: input.instructions,
              prompt: input.prompt,
            } as Json,
          }),
        ]);
      },
      prompt: input.prompt,
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const text of result.textStream) {
            if (firstTokenLatencyMs === null) {
              firstTokenLatencyMs = Date.now() - firstTokenStartedAt;
            }
            outputText += text;
            const chunk =
              responseShape === 'chat'
                ? {
                    choices: [{ delta: { content: text }, index: 0 }],
                    created: Math.floor(Date.now() / 1000),
                    id: context!.requestId,
                    model: input.model,
                    object: 'chat.completion.chunk',
                  }
                : {
                    delta: text,
                    response_id: context!.requestId,
                    type: 'response.output_text.delta',
                  };
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`)
            );
          }
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                response_id: context!.requestId,
                steps: observed.summaries(),
                type: 'response.completed',
              })}\n\n`
            )
          );
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error) {
          await settleMeteredExecution(context!, {
            error,
            firstTokenLatencyMs,
            status: request.signal.aborted ? 'aborted' : 'failed',
            usage: {
              outputTokens: approximateTokenCount(outputText),
            },
          }).catch(() => undefined);
          controller.error(error);
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...commonHeaders(context.requestId),
        connection: 'keep-alive',
        'content-type': 'text/event-stream; charset=utf-8',
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
