'use client';

import { Search } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useTranslations } from 'next-intl';
import {
  ACTIVITY_ACTIONS,
  ACTIVITY_RESOURCE_TYPES,
  toDateInputValue,
} from './activity-log-utils';

export interface ActivityLogFilters {
  action: string;
  actorQuery: string;
  affectedUserQuery: string;
  end: string;
  query: string;
  resourceType: string;
  start: string;
}

function FilterInput({
  defaultValue,
  placeholder,
  disabled,
  onCommit,
}: {
  defaultValue: string;
  placeholder: string;
  disabled?: boolean;
  onCommit: (value: string) => void;
}) {
  return (
    <div className="relative min-w-56">
      <Search className="pointer-events-none absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
      <Input
        key={defaultValue}
        defaultValue={defaultValue}
        placeholder={placeholder}
        disabled={disabled}
        className="h-9 pl-8"
        onBlur={(event) => onCommit(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            onCommit(event.currentTarget.value);
          }
        }}
      />
    </div>
  );
}

export function UserGroupActivityFilters({
  filters,
  compact,
  isPending,
  hasFilters,
  updateSearchParams,
}: {
  filters: ActivityLogFilters;
  compact?: boolean;
  isPending: boolean;
  hasFilters: boolean;
  updateSearchParams: (updates: Record<string, string | null>) => void;
}) {
  const t = useTranslations();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <FilterInput
        defaultValue={filters.query}
        placeholder={t('ws-user-group-activity.search_placeholder')}
        disabled={isPending}
        onCommit={(value) =>
          updateSearchParams({
            logQuery: value.trim() || null,
            logPage: '1',
          })
        }
      />
      {!compact && (
        <>
          <FilterInput
            defaultValue={filters.affectedUserQuery}
            placeholder={t('ws-user-group-activity.affected_user_placeholder')}
            disabled={isPending}
            onCommit={(value) =>
              updateSearchParams({
                logAffectedUserQuery: value.trim() || null,
                logPage: '1',
              })
            }
          />
          <FilterInput
            defaultValue={filters.actorQuery}
            placeholder={t('ws-user-group-activity.actor_placeholder')}
            disabled={isPending}
            onCommit={(value) =>
              updateSearchParams({
                logActorQuery: value.trim() || null,
                logPage: '1',
              })
            }
          />
        </>
      )}
      <Select
        value={filters.resourceType}
        onValueChange={(value) =>
          updateSearchParams({
            logResourceType: value === 'all' ? null : value,
            logPage: '1',
          })
        }
      >
        <SelectTrigger className="h-9 w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ACTIVITY_RESOURCE_TYPES.map((resourceType) => (
            <SelectItem key={resourceType} value={resourceType}>
              {t(`ws-user-group-activity.resources.${resourceType}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={filters.action}
        onValueChange={(value) =>
          updateSearchParams({
            logAction: value === 'all' ? null : value,
            logPage: '1',
          })
        }
      >
        <SelectTrigger className="h-9 w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ACTIVITY_ACTIONS.map((action) => (
            <SelectItem key={action} value={action}>
              {t(`ws-user-group-activity.actions.${action}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!compact && (
        <>
          <Input
            type="date"
            value={toDateInputValue(filters.start)}
            className="h-9 w-40"
            onChange={(event) =>
              updateSearchParams({
                logStart: event.currentTarget.value
                  ? `${event.currentTarget.value}T00:00:00.000Z`
                  : null,
                logPage: '1',
              })
            }
          />
          <Input
            type="date"
            value={toDateInputValue(filters.end)}
            className="h-9 w-40"
            onChange={(event) =>
              updateSearchParams({
                logEnd: event.currentTarget.value
                  ? `${event.currentTarget.value}T23:59:59.999Z`
                  : null,
                logPage: '1',
              })
            }
          />
        </>
      )}
      {hasFilters && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isPending}
          onClick={() =>
            updateSearchParams({
              logAction: null,
              logActorQuery: null,
              logAffectedUserQuery: null,
              logQuery: null,
              logResourceType: null,
              logPage: '1',
            })
          }
        >
          {t('ws-user-group-activity.clear_filters')}
        </Button>
      )}
    </div>
  );
}
