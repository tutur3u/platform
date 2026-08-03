import { CREDIT_UNIT_USD } from '../credits/constants';

export interface GeminiLiveUsageSnapshot {
  inputAudioTokens: number;
  inputImageTokens: number;
  inputTextTokens: number;
  inputVideoTokens: number;
  outputAudioTokens: number;
  outputTextTokens: number;
  searchQueries: number;
  thinkingTokens: number;
}

export interface GeminiLivePrice {
  inputAudioPerMillion: number;
  inputImageVideoPerMillion: number;
  inputTextPerMillion: number;
  outputAudioPerMillion: number;
  outputTextPerMillion: number;
  searchPerQuery: number;
}

export const GEMINI_3_1_FLASH_LIVE_PRICE: GeminiLivePrice = {
  inputAudioPerMillion: 3,
  inputImageVideoPerMillion: 1,
  inputTextPerMillion: 0.75,
  outputAudioPerMillion: 12,
  outputTextPerMillion: 4.5,
  searchPerQuery: 0.014,
};

export function calculateGeminiLiveCost(
  usage: GeminiLiveUsageSnapshot,
  price: GeminiLivePrice = GEMINI_3_1_FLASH_LIVE_PRICE
) {
  return (
    (usage.inputTextTokens * price.inputTextPerMillion) / 1_000_000 +
    (usage.inputAudioTokens * price.inputAudioPerMillion) / 1_000_000 +
    ((usage.inputImageTokens + usage.inputVideoTokens) *
      price.inputImageVideoPerMillion) /
      1_000_000 +
    ((usage.outputTextTokens + usage.thinkingTokens) *
      price.outputTextPerMillion) /
      1_000_000 +
    (usage.outputAudioTokens * price.outputAudioPerMillion) / 1_000_000 +
    usage.searchQueries * price.searchPerQuery
  );
}

export function calculateGeminiLiveCredits(
  usage: GeminiLiveUsageSnapshot,
  markupMultiplier = 1,
  price: GeminiLivePrice = GEMINI_3_1_FLASH_LIVE_PRICE
) {
  const costUsd = calculateGeminiLiveCost(usage, price);
  return costUsd === 0
    ? 0
    : Math.max(1, (costUsd / CREDIT_UNIT_USD) * markupMultiplier);
}
