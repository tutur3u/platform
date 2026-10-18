import { describe, expect, it } from 'vitest';
import { initialAiSettingsSchema } from './initial-ai-settings';

describe('optional initial tuple schema', () => {
  const tuple = {
    modelId: 'google/model',
    creditSource: 'workspace',
    creditWsId: null,
    thinkingMode: 'fast',
  };
  it('requires explicit nullable credit scope and all fields', () => {
    expect(initialAiSettingsSchema.parse(tuple)).toEqual(tuple);
    const { creditWsId: _, ...missing } = tuple;
    expect(initialAiSettingsSchema.safeParse(missing).success).toBe(false);
    expect(
      initialAiSettingsSchema.safeParse({ ...tuple, injected: true }).success
    ).toBe(false);
    expect(
      initialAiSettingsSchema.safeParse({ ...tuple, thinkingMode: 'other' })
        .success
    ).toBe(false);
  });
});
