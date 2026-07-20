'use client';

import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ListFilter,
  RefreshCw,
  Search,
} from '@tuturuuu/icons';
import type {
  InternalAccountSortBy,
  InternalAccountSortDirection,
} from '@tuturuuu/internal-api/infrastructure';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { Switch } from '@tuturuuu/ui/switch';
import { useTranslations } from 'next-intl';
import type { FormEvent } from 'react';

const SORT_OPTIONS: InternalAccountSortBy[] = [
  'displayName',
  'email',
  'createdAt',
  'lastSignInAt',
];

interface Props {
  activeOnly: boolean;
  count?: number;
  draftQuery: string;
  isFetching: boolean;
  onActiveOnlyChange: (value: boolean) => void;
  onDraftQueryChange: (value: string) => void;
  onRefresh: () => void;
  onSearch: (event: FormEvent<HTMLFormElement>) => void;
  onSortByChange: (value: InternalAccountSortBy) => void;
  onSortDirectionChange: (value: InternalAccountSortDirection) => void;
  onVerifiedOnlyChange: (value: boolean) => void;
  sortBy: InternalAccountSortBy;
  sortDirection: InternalAccountSortDirection;
  verifiedOnly: boolean;
}

export function InternalAccountsToolbar(props: Props) {
  const t = useTranslations('internal-accounts');
  const filterCount = Number(props.activeOnly) + Number(props.verifiedOnly);
  const DirectionIcon = props.sortDirection === 'asc' ? ArrowUp : ArrowDown;

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 shadow-xs">
      <div className="flex min-w-0 items-center gap-2">
        <form className="flex min-w-0 flex-1 gap-2" onSubmit={props.onSearch}>
          <div className="relative min-w-0 flex-1">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label={t('search.label')}
              className="pl-9"
              data-testid="internal-account-search"
              onChange={(event) => props.onDraftQueryChange(event.target.value)}
              placeholder={t('search.placeholder')}
              value={props.draftQuery}
            />
          </div>
          <Button aria-label={t('actions.search')} size="icon" type="submit">
            <Search className="size-4" />
          </Button>
        </form>

        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                aria-label={t('filters.title')}
                className="relative"
                size="icon"
                type="button"
                variant="outline"
              >
                <ListFilter className="size-4" />
                {filterCount ? (
                  <Badge className="absolute -top-2 -right-2 h-5 min-w-5 justify-center px-1 text-[10px]">
                    {filterCount}
                  </Badge>
                ) : null}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 space-y-4">
              <div>
                <p className="font-semibold text-sm">{t('filters.title')}</p>
                <p className="text-muted-foreground text-xs">
                  {t('filters.description')}
                </p>
              </div>
              <FilterSwitch
                checked={props.activeOnly}
                description={t('filters.active_description')}
                id="internal-accounts-active-only"
                label={t('filters.active_only')}
                onCheckedChange={props.onActiveOnlyChange}
              />
              <FilterSwitch
                checked={props.verifiedOnly}
                description={t('filters.verified_description')}
                id="internal-accounts-verified-only"
                label={t('filters.verified_only')}
                onCheckedChange={props.onVerifiedOnlyChange}
              />
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <Button
                aria-label={t('sorting.title')}
                size="icon"
                type="button"
                variant="outline"
              >
                <ArrowUpDown className="size-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 space-y-3">
              <p className="font-semibold text-sm">{t('sorting.title')}</p>
              <div className="grid gap-1">
                {SORT_OPTIONS.map((option) => (
                  <Button
                    className="justify-start"
                    key={option}
                    onClick={() => props.onSortByChange(option)}
                    size="sm"
                    type="button"
                    variant={props.sortBy === option ? 'secondary' : 'ghost'}
                  >
                    {t(`sorting.${option}`)}
                  </Button>
                ))}
              </div>
              <Button
                className="w-full justify-start"
                onClick={() =>
                  props.onSortDirectionChange(
                    props.sortDirection === 'asc' ? 'desc' : 'asc'
                  )
                }
                size="sm"
                type="button"
                variant="outline"
              >
                <DirectionIcon className="size-4" />
                {t(`sorting.${props.sortDirection}`)}
              </Button>
            </PopoverContent>
          </Popover>

          <Button
            aria-label={t('actions.refresh')}
            disabled={props.isFetching}
            onClick={props.onRefresh}
            size="icon"
            type="button"
            variant="outline"
          >
            <RefreshCw
              className={`size-4 ${props.isFetching ? 'animate-spin' : ''}`}
            />
          </Button>
        </div>
      </div>

      <p className="text-muted-foreground text-xs">
        {props.count === undefined
          ? t('count_loading')
          : t('count', { count: props.count })}
      </p>
    </div>
  );
}

function FilterSwitch({
  checked,
  description,
  id,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  description: string;
  id: string;
  label: string;
  onCheckedChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-0.5">
        <Label htmlFor={id}>{label}</Label>
        <p className="text-muted-foreground text-xs">{description}</p>
      </div>
      <Switch checked={checked} id={id} onCheckedChange={onCheckedChange} />
    </div>
  );
}
