import { createOpenAI } from '@tuturuuu/ai/openai';
import { z } from 'zod';
import { ChatGPTError } from './errors';
import { refreshRegistration } from './oauth';
import { chatGPTEnabled, withChatGPTStore } from './storage';

const modelsSchema = z.object({
  models: z.array(
    z.object({
      slug: z.string().min(1),
      display_name: z.string(),
      visibility: z.string(),
    })
  ),
});

export function parseChatGPTModel(value: string) {
  const match = /^chatgpt\/(oaiapp_[a-zA-Z0-9_-]+)\/([^/]+)$/.exec(value);
  if (!match)
    throw new ChatGPTError(
      'Select a model from your connected ChatGPT account',
      400,
      'CHATGPT_INVALID_MODEL'
    );
  return { clientId: match[1]!, slug: match[2]! };
}

export async function getChatGPTAccess(userId: string, clientId: string) {
  if (!chatGPTEnabled())
    throw new Error(
      'ChatGPT plan usage is only enabled for self-hosted installations'
    );
  return withChatGPTStore(userId, async (store) => {
    const registration = store.registrations.find(
      (entry) => entry.clientId === clientId
    );
    if (!registration?.scopes.includes('chatgpt.tokens.use.direct'))
      throw new ChatGPTError(
        'Reconnect your ChatGPT account',
        403,
        'CHATGPT_CONNECTION_REQUIRED'
      );
    await refreshRegistration(registration);
    return registration.accessToken!;
  });
}

export async function listChatGPTModels(accessToken: string) {
  const response = await fetch('https://api.openai.com/v1/models', {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok)
    throw new Error(
      'Unable to load ChatGPT models; reconnect or review your plan usage'
    );
  return modelsSchema
    .parse(await response.json())
    .models.filter((model) => model.visibility === 'list');
}

/** Only the parameters accepted by the plan-sharing preview reach OpenAI. */
export function prepareChatGPTRequest(body: Record<string, unknown>) {
  const allowed = new Set([
    'model',
    'input',
    'instructions',
    'text',
    'include',
  ]);
  const request = Object.fromEntries(
    Object.entries(body).filter(([key]) => allowed.has(key))
  );
  if (!Array.isArray(request.input))
    throw new Error('ChatGPT input must contain conversation history');
  request.input = request.input.map((item) => {
    if (
      item &&
      typeof item === 'object' &&
      'role' in item &&
      item.role === 'system'
    ) {
      return { ...item, role: 'developer' };
    }
    return item;
  });
  return { ...request, store: false, stream: true };
}

export const CHATGPT_USAGE_ERROR =
  'ChatGPT plan request failed. Review ChatGPT usage settings or reconnect your account. Tuturuuu credits were not used.';

/** EOF and incomplete responses cannot be mistaken for completed inference. */
export function validateChatGPTStream(body: ReadableStream<Uint8Array>) {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let pending = '';
  let terminal = false;
  function inspect(
    frame: string,
    controller: TransformStreamDefaultController<Uint8Array>
  ) {
    const data = frame
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .join('\n');
    if (data && data !== '[DONE]') {
      const event = JSON.parse(data) as { type?: string };
      if (
        event.type === 'response.completed' ||
        event.type === 'response.failed' ||
        event.type === 'error'
      )
        terminal = true;
      if (event.type === 'response.incomplete') {
        terminal = true;
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: 'error', sequence_number: 0, code: 'chatgpt_response_incomplete', message: CHATGPT_USAGE_ERROR })}\n\n`
          )
        );
        return;
      }
    }
    controller.enqueue(encoder.encode(`${frame}\n\n`));
  }
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        pending = (
          pending + decoder.decode(chunk, { stream: true })
        ).replaceAll('\r\n', '\n');
        let boundary = pending.indexOf('\n\n');
        while (boundary !== -1) {
          inspect(pending.slice(0, boundary), controller);
          pending = pending.slice(boundary + 2);
          boundary = pending.indexOf('\n\n');
        }
        if (pending.length > 4_000_000)
          throw new Error('ChatGPT stream event exceeded the supported size');
      },
      flush(controller) {
        pending += decoder.decode();
        if (pending.trim()) inspect(pending, controller);
        if (!terminal)
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: 'error', sequence_number: 0, code: 'chatgpt_stream_interrupted', message: CHATGPT_USAGE_ERROR })}\n\n`
            )
          );
      },
    })
  );
}

export async function resolveChatGPTModel(
  userId: string,
  modelId: string | undefined
) {
  const { clientId, slug } = parseChatGPTModel(modelId ?? '');
  const accessToken = await getChatGPTAccess(userId, clientId);
  const models = await listChatGPTModels(accessToken);
  if (!models.some((model) => model.slug === slug))
    throw new ChatGPTError(
      'The selected model is unavailable for this ChatGPT account',
      400,
      'CHATGPT_MODEL_UNAVAILABLE'
    );
  return createOpenAI({
    apiKey: accessToken,
    baseURL: 'https://api.openai.com/v1',
    fetch: async (url, init) => {
      if (String(url) !== 'https://api.openai.com/v1/responses')
        throw new Error('Unsupported ChatGPT endpoint');
      const body = prepareChatGPTRequest(JSON.parse(String(init?.body)));
      const response = await fetch(url, {
        ...init,
        body: JSON.stringify(body),
      });
      if (!response.ok || !response.body) throw new Error(CHATGPT_USAGE_ERROR);
      return new Response(validateChatGPTStream(response.body), {
        status: response.status,
        headers: { 'Content-Type': 'text/event-stream' },
      });
    },
  }).responses(slug);
}
