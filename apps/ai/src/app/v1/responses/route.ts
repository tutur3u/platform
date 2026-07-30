import { AiStudioError } from '@tuturuuu/ai/studio/errors';
import { getAiStudioRequestId } from '@tuturuuu/ai/studio/request';
import { publicApiError } from '@/lib/public-api';
import { executeTextRequest, parseTextRequest } from '@/lib/text-execution';

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
  const requestId = getAiStudioRequestId(request);
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const extensions =
      typeof body.tuturuuu === 'object' && body.tuturuuu
        ? (body.tuturuuu as Record<string, unknown>)
        : {};
    return executeTextRequest(
      request,
      parseTextRequest({
        instructions: body.instructions,
        max_output_tokens: body.max_output_tokens,
        max_steps: extensions.max_steps,
        model: body.model,
        prompt: responsePrompt(body.input),
        stream: body.stream,
        tools: extensions.tools,
      }),
      { feature: 'responses', responseShape: 'responses' }
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
