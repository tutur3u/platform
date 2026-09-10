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
  const grounding = content?.groundingMetadata;
  if (grounding) {
    saved.searchTurn ??= { queries: [], counted: 0 };
    const turn = saved.searchTurn;
    turn.queries = [
      ...new Set([
        ...turn.queries,
        ...(grounding.webSearchQueries ?? [])
          .map((query) => query.trim())
          .filter(Boolean),
      ]),
    ].slice(0, 1000);
    const known = Math.max(1, turn.queries.length);
    billing.usage.searchQueries += Math.max(0, known - turn.counted);
    turn.counted = known;
    if (!turn.queries.length) {
      saved.coverageGap = true;
      billing.incomplete = true;
    }
  }
  if (content?.turnComplete || content?.interrupted)
    saved.searchTurn = undefined;
}

export function markInterruptedUsage(saved: SavedSession) {
  if (!saved.pendingUsage || !saved.billing) return;
  saved.coverageGap = true;
  saved.billing.incomplete = true;
}
