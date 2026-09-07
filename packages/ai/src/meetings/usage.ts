export const MEET_AI_MODEL = 'gemini-3.1-flash-lite';
// Standard paid API pricing, verified 2026-09-07. USD per million tokens.
// https://ai.google.dev/gemini-api/docs/pricing#gemini-3.1-flash-lite
export const MEET_AI_PRICING = { text: 0.25, audio: 0.5, output: 1.5 };

export function measureMeetUsage(
  metadata: unknown,
  kind: 'audio' | 'text' = 'audio'
) {
  const value = metadata as {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
    promptTokensDetails?: { modality: string; tokenCount: number }[];
  } | null;
  const valid = (n: unknown): n is number =>
    typeof n === 'number' && Number.isFinite(n) && n >= 0;
  if (
    !value ||
    !valid(value.promptTokenCount) ||
    !valid(value.candidatesTokenCount)
  ) {
    return { costUsd: null, usage: { model: MEET_AI_MODEL, available: false } };
  }
  const inputTokens = value.promptTokenCount;
  const details = Array.isArray(value.promptTokensDetails)
    ? value.promptTokensDetails
    : undefined;
  const audioTokens = details
    ?.filter((entry) => entry.modality === 'AUDIO')
    .reduce(
      (sum, entry) => sum + (valid(entry.tokenCount) ? entry.tokenCount : 0),
      0
    );
  const outputTokens =
    value.candidatesTokenCount +
    (valid(value.thoughtsTokenCount) ? value.thoughtsTokenCount : 0);
  // Missing modality accounting must not silently bill audio at the text rate.
  const costUsd =
    details || kind === 'text'
      ? (Math.max(0, inputTokens - (audioTokens ?? 0)) * MEET_AI_PRICING.text +
          (audioTokens ?? 0) * MEET_AI_PRICING.audio +
          outputTokens * MEET_AI_PRICING.output) /
        1_000_000
      : null;
  return {
    costUsd,
    usage: {
      model: MEET_AI_MODEL,
      available: true,
      inputTokens,
      audioTokens: audioTokens ?? null,
      outputTokens,
      pricing: MEET_AI_PRICING,
      pricingDate: '2026-09-07',
      currency: 'USD',
    },
  };
}
