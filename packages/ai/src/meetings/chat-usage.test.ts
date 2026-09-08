import { describe, expect, it } from 'vitest';
import { type MeetChatModel, measureMeetChatUsage } from './chat-usage';

const model: MeetChatModel = {
  id: 'google/gemini-3.5-flash-lite',
  providerModelId: 'gemini-3.5-flash-lite',
  inputPricePerToken: 0.3 / 1_000_000,
  outputPricePerToken: 2.5 / 1_000_000,
  cacheReadPricePerToken: 0.03 / 1_000_000,
  tieredPricing: false,
};
const metadata = {
  promptTokenCount: 1000,
  candidatesTokenCount: 100,
  thoughtsTokenCount: 20,
};
describe('Mira catalog usage', () => {
  it('uses the selected model pricing and includes thinking output', () => {
    const result = measureMeetChatUsage(metadata, model);
    expect(result.costUsd).toBeCloseTo(0.0006);
    expect(result.usage).toMatchObject({
      model: model.id,
      inputTokens: 1000,
      outputTokens: 120,
      available: true,
    });
  });
  it('treats a null cache counter as no cached input', () => {
    expect(
      measureMeetChatUsage(
        { ...metadata, cachedContentTokenCount: null },
        model
      ).costUsd
    ).toBeCloseTo(0.0006);
  });
  it('bills cached input at its own catalog rate', () => {
    expect(
      measureMeetChatUsage({ ...metadata, cachedContentTokenCount: 500 }, model)
        .costUsd
    ).toBeCloseTo(0.000465);
  });
  it.each([null, {}, { promptTokenCount: 1000 }])(
    'does not invent usage when metadata is incomplete: %s',
    (value) => {
      expect(measureMeetChatUsage(value, model)).toMatchObject({
        costUsd: null,
        usage: { available: false },
      });
    }
  );
  it('retains token accounting with incomplete cost coverage', () => {
    for (const config of [
      { ...model, tieredPricing: true },
      { ...model, cacheReadPricePerToken: null },
    ]) {
      expect(
        measureMeetChatUsage(
          { ...metadata, cachedContentTokenCount: 500 },
          config
        )
      ).toMatchObject({ costUsd: null, usage: { available: true } });
    }
    expect(
      measureMeetChatUsage(
        { ...metadata, cachedContentTokenCount: 2000 },
        model
      ).costUsd
    ).toBeNull();
  });
});
