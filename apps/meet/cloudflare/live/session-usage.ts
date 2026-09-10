import type { LiveServerMessage } from '@google/genai/web';
import type { SavedSession } from './session-state';
import { accumulateLiveUsage } from './usage';

/** Observe synchronously, including final provider events while shutdown drains. */
export function observeSessionUsage(
  saved: SavedSession,
  message: LiveServerMessage
) {
  const billing = saved.billing;
  if (!billing) return;
  const content = message.serverContent;
  if (
    content?.inputTranscription?.text ||
    content?.outputTranscription?.text ||
    content?.modelTurn?.parts?.some((part) => part.inlineData?.data)
  )
    saved.pendingUsage = true;
  if (message.usageMetadata) {
    const result = accumulateLiveUsage(billing.usage, message.usageMetadata);
    billing.usage = result.usage;
    saved.coverageGap ||= result.incomplete;
    billing.incomplete = Boolean(saved.coverageGap);
    saved.pendingUsage = false;
  }
  if (
    content?.groundingMetadata &&
    !content.groundingMetadata.webSearchQueries?.length
  ) {
    saved.coverageGap = true;
    billing.incomplete = true;
    // Grounding proves at least one native search invocation, but not its
    // full query count. Preserve that known lower bound and the coverage gap.
    billing.usage.searchQueries += 1;
  }
  billing.usage.searchQueries +=
    content?.groundingMetadata?.webSearchQueries?.length ?? 0;
}

export function markInterruptedUsage(saved: SavedSession) {
  if (!saved.pendingUsage || !saved.billing) return;
  saved.coverageGap = true;
  saved.billing.incomplete = true;
}
