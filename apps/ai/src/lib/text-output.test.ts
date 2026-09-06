import { NoObjectGeneratedError } from 'ai';
import { describe, expect, it } from 'vitest';
import { responseFormatSchema, textOutput } from './text-output';

const context = {
  response: { id: 'provider', modelId: 'model', timestamp: new Date() },
  usage: {
    inputTokens: 10,
    outputTokens: 5,
    inputTokenDetails: {
      noCacheTokens: 10,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    },
    outputTokenDetails: { textTokens: 5, reasoningTokens: 0 },
    totalTokens: 15,
  },
  finishReason: 'stop' as const,
};
const schema = {
  type: 'object',
  properties: { answer: { type: 'string' } },
  required: ['answer'],
  additionalProperties: false,
};

describe('structured output strictness', () => {
  it('validates the requested schema when strict is true', async () => {
    const output = textOutput({
      type: 'json_schema',
      json_schema: { name: 'answer', strict: true, schema },
    });
    expect(
      await output.parseCompleteOutput({ text: '{"answer":"yes"}' }, context)
    ).toEqual({ answer: 'yes' });
    await expect(
      output.parseCompleteOutput({ text: '{"answer":42}' }, context)
    ).rejects.toBeInstanceOf(NoObjectGeneratedError);
    await expect(
      output.parseCompleteOutput(
        { text: '{"answer":"yes","extra":true}' },
        context
      )
    ).rejects.toBeInstanceOf(NoObjectGeneratedError);
  });
  it('keeps non-strict output as best-effort schema generation without strict validation', async () => {
    const output = textOutput({
      type: 'json_schema',
      json_schema: { name: 'answer', strict: false, schema },
    });
    expect(
      await output.parseCompleteOutput({ text: '{"answer":42}' }, context)
    ).toEqual({ answer: 42 });
  });
  it('rejects unsupported strict schemas before provider execution', () => {
    expect(
      responseFormatSchema.safeParse({
        type: 'json_schema',
        json_schema: {
          name: 'answer',
          strict: true,
          schema: { $ref: 'https://example.com/schema.json' },
        },
      }).success
    ).toBe(false);
  });
});
