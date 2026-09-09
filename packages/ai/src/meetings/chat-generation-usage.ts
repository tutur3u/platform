import { type MeetChatModel, measureMeetChatUsage } from './chat-usage';

export type MeetGenerationStep = {
  providerMetadata?: Record<string, Record<string, unknown>>;
  toolCalls?: Array<{ toolName: string }>;
};

/** Sum every tool-loop step; unknown grounding charges never become zero. */
export function measureMeetGeneration(
  steps: MeetGenerationStep[],
  model: MeetChatModel
) {
  let inputTokens = 0;
  let outputTokens = 0;
  let costUsd: number | null = 0;
  let available = steps.length > 0;
  let searchCount = 0;
  for (const step of steps) {
    const metadata = step.providerMetadata?.google;
    const measured = measureMeetChatUsage(metadata?.usageMetadata, model);
    if (measured.usage.available && 'inputTokens' in measured.usage) {
      inputTokens += measured.usage.inputTokens;
      outputTokens += measured.usage.outputTokens;
    } else available = false;
    costUsd =
      costUsd === null || measured.costUsd === null
        ? null
        : costUsd + measured.costUsd;
    const grounding = metadata?.groundingMetadata as
      | { webSearchQueries?: unknown }
      | undefined;
    const queries = grounding?.webSearchQueries;
    const searched = step.toolCalls?.some(
      (call) => call.toolName === 'google_search'
    );
    if (
      Array.isArray(queries) &&
      queries.length > 0 &&
      queries.every((query) => typeof query === 'string')
    ) {
      searchCount += model.providerModelId.startsWith('gemini-2.5')
        ? 1
        : queries.length;
      // Paid list-rate estimate before project-wide free allowance; verified
      // 2026-09-09: https://ai.google.dev/gemini-api/docs/pricing
      const fee = model.providerModelId.startsWith('gemini-3')
        ? queries.length * 0.014
        : model.providerModelId.startsWith('gemini-2.5')
          ? queries.length
            ? 0.035
            : 0
          : null;
      costUsd = costUsd === null || fee === null ? null : costUsd + fee;
    } else if (searched) {
      // At least one search invocation is known; exact billed query coverage
      // is unavailable. Keep provider cost incomplete and charge the known use.
      searchCount += 1;
      costUsd = null;
    }
  }
  return {
    costUsd,
    searchCount,
    usage: { available, inputTokens, outputTokens },
  };
}
