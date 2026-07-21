import type {
  ExternalProjectAttentionItem,
  ExternalProjectSummary,
} from '@tuturuuu/types';
import { describe, expect, it } from 'vitest';
import { getCmsHomeAttentionItems } from './cms-home-model';
import {
  cmsHomeCommerceQueryOptions,
  cmsHomeInsightsQueryOptions,
  cmsHomeSummaryQueryOptions,
} from './cms-home-query-options';

function attentionItem(
  entryId: string,
  kind: ExternalProjectAttentionItem['kind']
): ExternalProjectAttentionItem {
  return {
    collectionId: 'collection',
    collectionTitle: 'Posts',
    detail: 'Needs review',
    entryId,
    kind,
    scheduledFor: null,
    slug: entryId,
    status: 'draft',
    summary: null,
    title: entryId,
  };
}

describe('CMS home model', () => {
  it('prioritizes missing media, then scheduled and imported work', () => {
    const summary = {
      queues: {
        draftsMissingMedia: [attentionItem('media', 'missing_media')],
        recentlyImportedUnpublished: [
          attentionItem('imported', 'recently_imported_unpublished'),
        ],
        scheduledSoon: [attentionItem('scheduled', 'scheduled_soon')],
      },
    } as ExternalProjectSummary;

    expect(
      getCmsHomeAttentionItems(summary).map((item) => item.entryId)
    ).toEqual(['media', 'scheduled', 'imported']);
  });

  it('keeps the home queue compact', () => {
    const summary = {
      queues: {
        draftsMissingMedia: Array.from({ length: 8 }, (_, index) =>
          attentionItem(`draft-${index}`, 'missing_media')
        ),
        recentlyImportedUnpublished: [],
        scheduledSoon: [],
      },
    } as ExternalProjectSummary;

    expect(getCmsHomeAttentionItems(summary)).toHaveLength(6);
  });

  it('uses stable workspace-scoped cache keys', () => {
    expect(cmsHomeSummaryQueryOptions('workspace').queryKey).toEqual([
      'cms-home',
      'workspace',
      'summary',
    ]);
    expect(cmsHomeCommerceQueryOptions('workspace').queryKey).toEqual([
      'cms-home',
      'workspace',
      'commerce',
    ]);
    expect(cmsHomeInsightsQueryOptions('workspace').queryKey).toEqual([
      'cms-home',
      'workspace',
      'insights',
    ]);
    expect(cmsHomeSummaryQueryOptions('workspace').staleTime).toBe(120_000);
  });
});
