import type {
  ExternalProjectAttentionItem,
  ExternalProjectSummary,
} from '@tuturuuu/types';

const HOME_ATTENTION_LIMIT = 6;

type CmsHomeAttentionQueues = Pick<
  ExternalProjectSummary['queues'],
  'draftsMissingMedia' | 'recentlyImportedUnpublished' | 'scheduledSoon'
>;

export function getCmsHomeAttentionItems(summary: {
  queues: CmsHomeAttentionQueues;
}): ExternalProjectAttentionItem[] {
  return [
    ...summary.queues.draftsMissingMedia,
    ...summary.queues.scheduledSoon,
    ...summary.queues.recentlyImportedUnpublished,
  ].slice(0, HOME_ATTENTION_LIMIT);
}
