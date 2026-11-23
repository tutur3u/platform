'use client';

import {
  LoadingRegion,
  SkeletonLine,
  SkeletonList,
} from '@tuturuuu/ui/skeleton';
import { useTranslations } from 'next-intl';

/** Rows shown in the word-suggestion popover while suggestions load. */
export function SuggestionsLoading() {
  const t = useTranslations('teachVocabulary');
  return (
    <LoadingRegion className="px-3 py-2" srLabel={t('loadingSuggestions')}>
      <SkeletonLine barClassName="w-1/2" />
      <SkeletonLine barClassName="w-2/3" size="xs" />
    </LoadingRegion>
  );
}

/** Card grid placeholder for the vocabulary entries. */
export function EntriesLoading() {
  const t = useTranslations('teachVocabulary');
  return (
    <LoadingRegion srLabel={t('loading')}>
      <SkeletonList rows={3} withAvatar={false} />
    </LoadingRegion>
  );
}
