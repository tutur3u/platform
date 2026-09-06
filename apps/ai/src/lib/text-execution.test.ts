import { AiStudioError } from '@tuturuuu/ai/studio/errors';
import { describe, expect, it } from 'vitest';
import { parseTextRequest } from './text-execution';

describe('AI Studio text request extensions', () => {
  it('accepts bounded safe tools and step limits', () => {
    expect(
      parseTextRequest({
        max_steps: 8,
        model: 'openai/gpt-5-mini',
        prompt: 'Calculate 128 * 37',
        tools: ['calculator', 'current_time'],
      })
    ).toEqual(
      expect.objectContaining({
        max_steps: 8,
        tools: ['calculator', 'current_time'],
      })
    );
  });

  it('rejects arbitrary tools and unbounded loops as a stable client error', () => {
    expect(() =>
      parseTextRequest({
        max_steps: 99,
        model: 'openai/gpt-5-mini',
        prompt: 'Run arbitrary code',
        tools: ['shell'],
      })
    ).toThrow(AiStudioError);
  });
});

describe('structured response contracts', () => {
  it('preserves the requested JSON schema and token budget', () => {
    const response_format = {
      type: 'json_schema',
      json_schema: {
        name: 'analysis',
        strict: true,
        schema: {
          type: 'object',
          properties: { summary: { type: 'string' } },
          required: ['summary'],
        },
      },
    };
    expect(
      parseTextRequest({
        model: 'google/gemini-3.5-flash-lite',
        prompt: 'Analyze',
        max_output_tokens: 16384,
        response_format,
      })
    ).toMatchObject({ response_format, max_output_tokens: 16384 });
  });
  it('rejects malformed output formats before a billable call', () => {
    expect(() =>
      parseTextRequest({
        model: 'model',
        prompt: 'Analyze',
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'analysis', schema: [] },
        },
      })
    ).toThrow(AiStudioError);
  });
});
