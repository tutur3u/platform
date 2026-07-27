import { AiStudioError } from '@tuturuuu/ai/studio/errors';
import { executeTextRequest, textRequestSchema } from '@/lib/text-execution';

function responsePrompt(input: unknown): string {
  if (typeof input === 'string') return input;
  if (Array.isArray(input)) {
    return input
      .map((entry) =>
        typeof entry === 'string'
          ? entry
          : typeof entry === 'object' && entry && 'content' in entry
            ? String(entry.content)
            : JSON.stringify(entry)
      )
      .join('\n');
  }
  throw new AiStudioError('The input field is required.', {
    code: 'invalid_request_error',
    status: 400,
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as Record<string, unknown>;
  return executeTextRequest(
    request,
    textRequestSchema.parse({
      instructions: body.instructions,
      max_output_tokens: body.max_output_tokens,
      model: body.model,
      prompt: responsePrompt(body.input),
      stream: body.stream,
    }),
    { feature: 'responses', responseShape: 'responses' }
  );
}
