import { AiStudioError } from '@tuturuuu/ai/studio/errors';
import { getAiStudioRequestId } from '@tuturuuu/ai/studio/request';
import { publicApiError } from '@/lib/public-api';
import { executeTextRequest, parseTextRequest } from '@/lib/text-execution';

type ChatMessage = {
  content?: unknown;
  role?: unknown;
};

function normalizeMessages(input: unknown) {
  if (!Array.isArray(input) || input.length === 0) {
    throw new AiStudioError('At least one message is required.', {
      code: 'invalid_request_error',
      status: 400,
    });
  }

  const messages = input as ChatMessage[];
  const system = messages
    .filter((message) => message.role === 'system')
    .map((message) => String(message.content ?? ''))
    .join('\n');
  const prompt = messages
    .filter((message) => message.role !== 'system')
    .map(
      (message) =>
        `${String(message.role ?? 'user')}: ${String(message.content ?? '')}`
    )
    .join('\n');

  return { prompt, system };
}

export async function POST(request: Request) {
  const requestId = getAiStudioRequestId(request);
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const messages = normalizeMessages(body.messages);
    const extensions =
      typeof body.tuturuuu === 'object' && body.tuturuuu
        ? (body.tuturuuu as Record<string, unknown>)
        : {};

    return executeTextRequest(
      request,
      parseTextRequest({
        instructions: messages.system || undefined,
        max_output_tokens: body.max_completion_tokens ?? body.max_tokens,
        max_steps: extensions.max_steps,
        model: body.model,
        prompt: messages.prompt,
        stream: body.stream,
        tools: extensions.tools,
      }),
      { feature: 'chat_completions', responseShape: 'chat' }
    );
  } catch (error) {
    return publicApiError(
      error instanceof SyntaxError
        ? new AiStudioError('Request body must be valid JSON.', {
            code: 'invalid_request_error',
            status: 400,
          })
        : error,
      requestId
    );
  }
}
