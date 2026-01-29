'use client';

import { TagFilter } from '@tuturuuu/ui/finance/transactions/tag-filter';
import {
  parseAsArrayOf,
  parseAsInteger,
  parseAsString,
  useQueryState,
} from 'nuqs';
import { useFilterReset } from './hooks/use-filter-reset';

interface TagFilterWrapperProps {
  wsId: string;
}

export function TagFilterWrapper({ wsId }: TagFilterWrapperProps) {
  const [currentTagIds, setTagIds] = useQueryState(
    'tagIds',
    parseAsArrayOf(parseAsString).withDefault([]).withOptions({
      shallow: true,
    })
  );

  const [, setPage] = useQueryState(
    'page',
    parseAsInteger.withDefault(1).withOptions({
      shallow: true,
    })
  );

  const handleTagsChange = useFilterReset(setTagIds, setPage);

  return (
    <TagFilter
      wsId={wsId}
      selectedTagIds={currentTagIds}
      onTagsChange={handleTagsChange}
    />
  );
}
