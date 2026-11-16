export type AiTokenUsage = {
  inputTokens?: number;
  /** Total output, including reasoning, as reported by the AI SDK. */
  outputTokens?: number;
  outputTokenDetails?: { reasoningTokens?: number };
  /** Compatibility with persisted usage from older SDK versions. */
  reasoningTokens?: number;
};

function tokenCount(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : 0;
}

/** Keep reasoning as a subset of total output, never additional output. */
export function normalizeAiTokenUsage(usage: AiTokenUsage) {
  const outputTokens = tokenCount(usage.outputTokens);
  return {
    inputTokens: tokenCount(usage.inputTokens),
    outputTokens,
    reasoningTokens: Math.min(
      outputTokens,
      tokenCount(
        usage.outputTokenDetails?.reasoningTokens ?? usage.reasoningTokens
      )
    ),
  };
}

/**
 * The SQL pricing/ledger contract has disjoint output and reasoning buckets.
 * Convert only at that boundary; SDK/API/display output remains the total.
 * Never pass these buckets back into a helper expecting SDK total output.
 */
export function toLegacyTokenPricing(usage: AiTokenUsage) {
  const normalized = normalizeAiTokenUsage(usage);
  return {
    ...normalized,
    outputTokens: normalized.outputTokens - normalized.reasoningTokens,
  };
}
