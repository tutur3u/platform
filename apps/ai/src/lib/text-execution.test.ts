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
