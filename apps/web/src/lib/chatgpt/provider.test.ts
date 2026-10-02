// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  parseChatGPTModel,
  prepareChatGPTRequest,
  validateChatGPTStream,
} from './provider';

async function streamText(chunks: string[]) {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(validateChatGPTStream(body)).text();
}

describe('ChatGPT subscription transport', () => {
  it('forces preview requirements and omits API-key-only parameters and hosted tools', () => {
    const request = prepareChatGPTRequest({
      model: 'account-model',
      input: [{ type: 'message', role: 'system', content: 'Instructions' }],
      store: true,
      stream: false,
      temperature: 1,
      max_output_tokens: 10,
      metadata: { secret: 'ignored' },
      tools: [{ type: 'image_generation' }],
      previous_response_id: 'old-response',
      background: true,
    });
    expect(request).toEqual({
      model: 'account-model',
      input: [{ type: 'message', role: 'developer', content: 'Instructions' }],
      store: false,
      stream: true,
    });
  });
  it('separates account registration from model slug and rejects arbitrary endpoints', () => {
    expect(parseChatGPTModel('chatgpt/oaiapp_example/account-model')).toEqual({
      clientId: 'oaiapp_example',
      slug: 'account-model',
    });
    expect(() => parseChatGPTModel('chatgpt/../../models')).toThrow();
    expect(() => parseChatGPTModel('openai/account-model')).toThrow();
  });
  it('accepts completed SSE across split CRLF boundaries', async () => {
    const result = await streamText([
      'data: {"type":"response.completed"}\r',
      '\n\r',
      '\n',
    ]);
    expect(result).toContain('response.completed');
    expect(result).not.toContain('chatgpt_stream_interrupted');
  });
  it('marks EOF after partial output as failure', async () => {
    const result = await streamText([
      'data: {"type":"response.output_text.delta","delta":"partial"}\n\n',
    ]);
    expect(result).toContain('chatgpt_stream_interrupted');
  });
  it('marks incomplete inference as failure and preserves late subscription errors', async () => {
    expect(
      await streamText(['data: {"type":"response.incomplete"}\n\n'])
    ).toContain('chatgpt_response_incomplete');
    const failed = await streamText([
      'data: {"type":"response.failed","response":{"error":{"code":"subscription_sharing_usage_limit_exceeded"}}}\n\n',
    ]);
    expect(failed).toContain('subscription_sharing_usage_limit_exceeded');
    expect(failed).not.toContain('chatgpt_stream_interrupted');
  });
});
