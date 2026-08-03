import { describe, expect, it } from 'vitest';
import { calculateGeminiLiveCost, calculateGeminiLiveCredits } from './usage';

describe('Gemini Live usage pricing', () => {
  it('prices every modality, thinking, and grounded searches once', () => {
    const cost = calculateGeminiLiveCost({
      inputAudioTokens: 1_000_000,
      inputImageTokens: 500_000,
      inputTextTokens: 1_000_000,
      inputVideoTokens: 500_000,
      outputAudioTokens: 1_000_000,
      outputTextTokens: 900_000,
      searchQueries: 2,
      thinkingTokens: 100_000,
    });

    expect(cost).toBeCloseTo(21.278, 8);
    expect(
      calculateGeminiLiveCredits({
        inputAudioTokens: 1_000_000,
        inputImageTokens: 500_000,
        inputTextTokens: 1_000_000,
        inputVideoTokens: 500_000,
        outputAudioTokens: 1_000_000,
        outputTextTokens: 900_000,
        searchQueries: 2,
        thinkingTokens: 100_000,
      })
    ).toBeCloseTo(212_780, 4);
  });

  it('does not impose a minimum charge on an empty provider snapshot', () => {
    expect(
      calculateGeminiLiveCredits({
        inputAudioTokens: 0,
        inputImageTokens: 0,
        inputTextTokens: 0,
        inputVideoTokens: 0,
        outputAudioTokens: 0,
        outputTextTokens: 0,
        searchQueries: 0,
        thinkingTokens: 0,
      })
    ).toBe(0);
  });
});
