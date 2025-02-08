import { Filter } from '../filters';
import { createClient } from '@repo/supabase/next/server';
import { UserGroup } from '@repo/types/primitives/UserGroup';
import { MinusCircle, PlusCircle } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

interface SearchParams {
  q?: string;
  page?: string;
  pageSize?: string;
  includedTags?: string | string[];
  excludedTags?: string | string[];
}

export default async function Filters({
  wsId,
  searchParams,
}: {
  wsId: string;
  searchParams: SearchParams;
}) {
  const t = await getTranslations('user-group-data-table');

  const { data: tags } = await getTags(wsId);
  const { data: excludedTags } = await getExcludedTags(wsId, searchParams);

  return (
    <>
      <Filter
        key="included-user-tags-filter"
        tag="includedTags"
        title={t('included_tags')}
        icon={<PlusCircle className="mr-2 h-4 w-4" />}
        options={tags.map((tag) => ({
          label: tag.name || 'No name',
          value: tag.id,
          count: tag.amount,
        }))}
        disabled
      />
      <Filter
        key="excluded-user-tags-filter"
        tag="excludedTags"
        title={t('excluded_tags')}
        icon={<MinusCircle className="mr-2 h-4 w-4" />}
        options={excludedTags.map((tag) => ({
          label: tag.name || 'No name',
          value: tag.id,
          count: tag.amount,
        }))}
        disabled
      />
    </>
  );
}

async function getTags(wsId: string) {
  const supabase = await createClient();

  const queryBuilder = supabase
    .from('workspace_user_groups_with_amount')
    .select('id, name, amount', {
      count: 'exact',
    })
    .eq('ws_id', wsId)
    .order('name');

  const { data, error, count } = await queryBuilder;
  if (error) throw error;

  return { data, count } as { data: UserGroup[]; count: number };
}

async function getExcludedTags(wsId: string, { includedTags }: SearchParams) {
  const supabase = await createClient();

  if (!includedTags || includedTags.length === 0) {
    return getTags(wsId);
  }

  const queryBuilder = supabase
    .rpc(
      'get_possible_excluded_groups',
      {
        _ws_id: wsId,
        included_groups: Array.isArray(includedTags)
          ? includedTags
          : [includedTags],
      },
      {
        count: 'exact',
      }
    )
    .select('id, name, amount')
    .order('name');

  const { data, error, count } = await queryBuilder;
  if (error) throw error;

  return { data, count } as { data: UserGroup[]; count: number };
}
