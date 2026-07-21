import type {
  ExternalProjectAttentionItem,
  ExternalProjectSummary,
} from '@tuturuuu/types';

const HOME_ATTENTION_LIMIT = 6;

export function getCmsHomeAttentionItems(
  summary: ExternalProjectSummary
): ExternalProjectAttentionItem[] {
  return [
    ...summary.queues.draftsMissingMedia,
    ...summary.queues.scheduledSoon,
    ...summary.queues.recentlyImportedUnpublished,
  ].slice(0, HOME_ATTENTION_LIMIT);
}
