'use client';

import {
  Archive,
  CircleCheck,
  ListFilter,
  MinusCircle,
  PlusCircle,
} from '@tuturuuu/icons';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import {
  useExcludedUserGroups,
  useWorkspaceUserGroups,
} from '@tuturuuu/users-ui/database/hooks';
import { useTranslations } from 'next-intl';
import { parseAsArrayOf, parseAsString, useQueryState } from 'nuqs';
import { Filter } from '../filters';
import type { UserGroupStatusFilter } from './hooks';

export default function Filters({
  wsId,
  status,
  onStatusChange,
}: {
  wsId: string;
  status: UserGroupStatusFilter;
  onStatusChange: (value: UserGroupStatusFilter) => void;
}) {
  const t = useTranslations('user-group-data-table');

  const [includedTags] = useQueryState(
    'includedTags',
    parseAsArrayOf(parseAsString).withDefault([]).withOptions({
      shallow: true,
    })
  );

  const { data: tags = [] } = useWorkspaceUserGroups(wsId);
  const { data: excludedTags = [] } = useExcludedUserGroups(wsId, includedTags);

  return (
    <>
      <Filter
        key="included-user-tags-filter"
        tag="includedTags"
        title={t('included_tags')}
        icon={<PlusCircle className="mr-2 h-4 w-4" />}
        options={tags.map((tag: UserGroup) => ({
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
        options={excludedTags.map((tag: UserGroup) => ({
          label: tag.name || 'No name',
          value: tag.id,
          count: tag.amount,
        }))}
        disabled
      />
      <Select
        value={status}
        onValueChange={(value) =>
          onStatusChange(value as UserGroupStatusFilter)
        }
      >
        <SelectTrigger className="h-8 w-44">
          <SelectValue aria-label={t('status')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="active">
            <span className="flex items-center gap-2">
              <CircleCheck className="h-4 w-4" />
              {t('active_groups')}
            </span>
          </SelectItem>
          <SelectItem value="all">
            <span className="flex items-center gap-2">
              <ListFilter className="h-4 w-4" />
              {t('all_groups')}
            </span>
          </SelectItem>
          <SelectItem value="archived">
            <span className="flex items-center gap-2">
              <Archive className="h-4 w-4" />
              {t('archived_groups')}
            </span>
          </SelectItem>
        </SelectContent>
      </Select>
    </>
  );
}
