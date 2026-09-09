import { expect, it } from 'vitest';
import { measureMeetGeneration } from './chat-generation-usage';

const model = {
  id: 'google/gemini-3.1-flash-lite',
  providerModelId: 'gemini-3.1-flash-lite',
  inputPricePerToken: 0.25 / 1e6,
  outputPricePerToken: 1.5 / 1e6,
  cacheReadPricePerToken: null,
  tieredPricing: false,
};
const step = {
  providerMetadata: {
    google: {
      usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20 },
    },
  },
};
it('charges all tool-loop steps and separately estimates every reported search query', () => {
  const result = measureMeetGeneration(
    [
      step,
      {
        ...step,
        providerMetadata: {
          google: {
            ...step.providerMetadata.google,
            groundingMetadata: { webSearchQueries: ['rmit', 'rmit vietnam'] },
          },
        },
      },
    ],
    model
  );
  expect(result.usage).toEqual({
    available: true,
    inputTokens: 200,
    outputTokens: 40,
  });
  expect(result.searchCount).toBe(2);
  expect(result.costUsd).toBeCloseTo(0.02811);
});
it('keeps missing step usage and missing search billing coverage incomplete', () => {
  expect(measureMeetGeneration([step, {}], model)).toMatchObject({
    costUsd: null,
    usage: { available: false },
  });
  expect(
    measureMeetGeneration(
      [{ ...step, toolCalls: [{ toolName: 'google_search' }] }],
      model
    )
  ).toMatchObject({ costUsd: null, searchCount: 1 });
});

it('keeps empty grounding metadata incomplete for known search calls and counts legacy prompts once', () => {
  const searchStep = {
    ...step,
    toolCalls: [{ toolName: 'google_search' }],
    providerMetadata: {
      google: {
        ...step.providerMetadata.google,
        groundingMetadata: { webSearchQueries: [] as string[] },
      },
    },
  };
  expect(measureMeetGeneration([searchStep], model)).toMatchObject({
    costUsd: null,
    searchCount: 1,
  });
  searchStep.providerMetadata.google.groundingMetadata.webSearchQueries = [
    'one',
    'two',
  ];
  expect(
    measureMeetGeneration([searchStep], {
      ...model,
      providerModelId: 'gemini-2.5-flash',
    }).searchCount
  ).toBe(1);
});
