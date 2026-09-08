import { measureMeetUsage } from './usage';

export interface MeetChatModel {
  id: string;
  providerModelId: string;
  inputPricePerToken: number;
  outputPricePerToken: number;
  cacheReadPricePerToken: number | null;
  tieredPricing: boolean;
}

/** Catalog estimate, not an invoice; retain unknown pricing as incomplete. */
export function measureMeetChatUsage(metadata: unknown, model: MeetChatModel) {
  const { usage: tokens } = measureMeetUsage(metadata, 'text');
  const base = { model: model.id, pricingSource: 'ai_gateway_models' };
  if (
    !tokens.available ||
    typeof tokens.inputTokens !== 'number' ||
    typeof tokens.outputTokens !== 'number'
  ) {
    return { costUsd: null, usage: { ...base, available: false } };
  }
  const { inputTokens, outputTokens } = tokens;
  const cached = (metadata as { cachedContentTokenCount?: unknown })
    .cachedContentTokenCount;
  const cachedTokens = cached === undefined ? 0 : cached;
  const validCache =
    typeof cachedTokens === 'number' &&
    Number.isFinite(cachedTokens) &&
    cachedTokens >= 0 &&
    cachedTokens <= inputTokens;
  const costUsd =
    !model.tieredPricing &&
    validCache &&
    (cachedTokens === 0 || model.cacheReadPricePerToken !== null)
      ? (inputTokens - cachedTokens) * model.inputPricePerToken +
        cachedTokens * (model.cacheReadPricePerToken ?? 0) +
        outputTokens * model.outputPricePerToken
      : null;
  return {
    costUsd,
    usage: {
      ...base,
      available: true,
      inputTokens,
      outputTokens,
      currency: 'USD',
    },
  };
}
