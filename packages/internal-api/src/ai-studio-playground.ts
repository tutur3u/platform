export type AiStudioPlaygroundEndpoint = 'chat' | 'responses';
export type AiStudioPlaygroundTool = 'calculator' | 'current_time';

export interface AiStudioPublicModel {
  contextWindow: number;
  id: string;
  maxOutputTokens: number;
  name: string;
  ownedBy: string;
  type: string;
}

export interface AiStudioPlaygroundStep {
  latencyMs: number | null;
  name: string;
  sequence: number;
  status: 'failed' | 'succeeded';
  type: 'model' | 'tool';
}

export interface AiStudioPlaygroundResult {
  endpoint: AiStudioPlaygroundEndpoint;
  model: string;
  outputText: string;
  requestId: string;
  steps: AiStudioPlaygroundStep[];
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}

function publicApiUrl(path: string, baseUrl = 'https://ai.tuturuuu.com') {
  return `${baseUrl.replace(/\/+$/u, '')}${path}`;
}

async function parsePublicAiResponse<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => null)) as
    | (T & { error?: { code?: string; message?: string } })
    | null;
  if (!response.ok) {
    throw new Error(
      body?.error?.message ?? `AI endpoint returned ${response.status}.`
    );
  }
  if (!body) throw new Error('AI endpoint returned an empty response.');
  return body;
}

export async function getAiStudioPublicModels(
  secret: string,
  options?: { baseUrl?: string; fetch?: typeof fetch }
): Promise<AiStudioPublicModel[]> {
  const fetcher = options?.fetch ?? fetch;
  const response = await fetcher(publicApiUrl('/v1/models', options?.baseUrl), {
    cache: 'no-store',
    headers: { Authorization: `Bearer ${secret}` },
  });
  const body = await parsePublicAiResponse<{
    data: Array<{
      id: string;
      owned_by: string;
      tuturuuu: {
        context_window: number;
        max_output_tokens: number;
        name: string;
        type: string;
      };
    }>;
  }>(response);
  return body.data.map((model) => ({
    contextWindow: model.tuturuuu.context_window,
    id: model.id,
    maxOutputTokens: model.tuturuuu.max_output_tokens,
    name: model.tuturuuu.name,
    ownedBy: model.owned_by,
    type: model.tuturuuu.type,
  }));
}

export async function runAiStudioPlayground(
  secret: string,
  input: {
    endpoint: AiStudioPlaygroundEndpoint;
    instructions?: string;
    maxOutputTokens: number;
    maxSteps: number;
    model: string;
    prompt: string;
    tools: AiStudioPlaygroundTool[];
  },
  options?: { baseUrl?: string; fetch?: typeof fetch }
): Promise<AiStudioPlaygroundResult> {
  const fetcher = options?.fetch ?? fetch;
  const extension = { max_steps: input.maxSteps, tools: input.tools };
  const chat = input.endpoint === 'chat';
  const response = await fetcher(
    publicApiUrl(
      chat ? '/v1/chat/completions' : '/v1/responses',
      options?.baseUrl
    ),
    {
      body: JSON.stringify(
        chat
          ? {
              max_completion_tokens: input.maxOutputTokens,
              messages: [
                ...(input.instructions
                  ? [{ content: input.instructions, role: 'system' }]
                  : []),
                { content: input.prompt, role: 'user' },
              ],
              model: input.model,
              tuturuuu: extension,
            }
          : {
              input: input.prompt,
              instructions: input.instructions,
              max_output_tokens: input.maxOutputTokens,
              model: input.model,
              tuturuuu: extension,
            }
      ),
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }
  );
  const body = await parsePublicAiResponse<{
    choices?: Array<{ message?: { content?: string } }>;
    id: string;
    model: string;
    output_text?: string;
    tuturuuu?: { steps?: AiStudioPlaygroundStep[] };
    usage?: {
      completion_tokens?: number;
      input_tokens?: number;
      output_tokens?: number;
      prompt_tokens?: number;
      total_tokens?: number;
    };
  }>(response);
  const inputTokens =
    body.usage?.input_tokens ?? body.usage?.prompt_tokens ?? 0;
  const outputTokens =
    body.usage?.output_tokens ?? body.usage?.completion_tokens ?? 0;
  return {
    endpoint: input.endpoint,
    model: body.model,
    outputText: body.output_text ?? body.choices?.[0]?.message?.content ?? '',
    requestId: body.id,
    steps: body.tuturuuu?.steps ?? [],
    usage: {
      inputTokens,
      outputTokens,
      totalTokens: body.usage?.total_tokens ?? inputTokens + outputTokens,
    },
  };
}
