import { AiStudioError } from '@tuturuuu/ai/studio/errors';
import { executeTextRequest, textRequestSchema } from '@/lib/text-execution';

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
  const body = (await request.json()) as Record<string, unknown>;
  const messages = normalizeMessages(body.messages);

  return executeTextRequest(
    request,
    textRequestSchema.parse({
      instructions: messages.system || undefined,
      max_output_tokens: body.max_completion_tokens ?? body.max_tokens,
      model: body.model,
      prompt: messages.prompt,
      stream: body.stream,
    }),
    { feature: 'chat_completions', responseShape: 'chat' }
  );
}
