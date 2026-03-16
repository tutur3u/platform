'use client';

import { useQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@tuturuuu/ui/command';
import { useDebounce } from '@tuturuuu/ui/hooks/use-debounce';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { Separator } from '@tuturuuu/ui/separator';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { parseAsString, useQueryStates } from 'nuqs';
import { useEffect, useMemo, useState } from 'react';
import GroupReportsClient from '../groups/[groupId]/reports/client';
import {
  type ReportStatusCounts,
  ReportStatusIndicator,
} from './components/report-status-indicator';

interface Props {
  wsId: string;
  canCheckUserAttendance: boolean;
  canApproveReports: boolean;
  canCreateReports: boolean;
  canUpdateReports: boolean;
  canDeleteReports: boolean;
}

export default function GroupReportsSelector({
  wsId,
  canCheckUserAttendance,
  canApproveReports,
  canCreateReports,
  canUpdateReports,
  canDeleteReports,
}: Props) {
  const t = useTranslations();

  const tc = useTranslations('common');

  const [open, setOpen] = useState(false);

  const [filterParams, setFilterParams] = useQueryStates(
    {
      groupId: parseAsString,
      userId: parseAsString,
      reportId: parseAsString,
    },
    { history: 'replace' }
  );

  const selectedGroupId = filterParams.groupId;

  const [query, setQuery] = useState('');
  const [debouncedQuery] = useDebounce(query, 300);

  const reportGroupsQuery = useQuery({
    queryKey: [
      'ws',
      wsId,
      'report-groups-selector',
      debouncedQuery,
      selectedGroupId,
    ],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (debouncedQuery) {
        searchParams.set('q', debouncedQuery);
      }
      if (selectedGroupId) {
        searchParams.set('selectedGroupId', selectedGroupId);
      }

      const response = await fetch(
        `/api/v1/workspaces/${wsId}/users/reports/groups?${searchParams.toString()}`,
        { cache: 'no-store' }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch report groups');
      }

      return (await response.json()) as {
        groupStatusSummary: Array<{
          approved_count: number;
          group_id: string;
          pending_count: number;
          rejected_count: number;
        }>;
        groups: Array<{ id: string; name: string | null }>;
        selectedGroup: { id: string; name: string | null } | null;
        selectedGroupManagers: Array<{ id: string; full_name: string | null }>;
      };
    },
    enabled: !!wsId,
    staleTime: 2 * 60 * 1000,
  });

  const groups = reportGroupsQuery.data?.groups ?? [];
  const selectedGroup = reportGroupsQuery.data?.selectedGroup ?? null;
  const selectedGroupManagers =
    reportGroupsQuery.data?.selectedGroupManagers ?? [];

  const groupStatusMap = useMemo(() => {
    const map = new Map<string, ReportStatusCounts>();
    for (const row of reportGroupsQuery.data?.groupStatusSummary ?? []) {
      map.set(row.group_id, {
        pending_count: row.pending_count,
        approved_count: row.approved_count,
        rejected_count: row.rejected_count,
      });
    }
    return map;
  }, [reportGroupsQuery.data?.groupStatusSummary]);

  // Auto-select first group when groups load and none is selected
  useEffect(() => {
    if (!selectedGroupId && groups.length > 0 && groups[0]?.id) {
      setFilterParams({
        groupId: groups[0].id,
        userId: null,
        reportId: null,
      });
    }
  }, [selectedGroupId, groups, setFilterParams]);

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex flex-col gap-2">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={open}
                className="w-full max-w-sm justify-between"
              >
                <span className="flex items-center gap-2">
                  {selectedGroupId && (
                    <ReportStatusIndicator
                      counts={groupStatusMap.get(selectedGroupId)}
                    />
                  )}
                  {selectedGroup
                    ? selectedGroup.name
                    : t('ws-user-groups.select_group_placeholder')}
                </span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-100 max-w-(--radix-popover-trigger-width) p-0">
              <Command shouldFilter={false}>
                <CommandInput
                  placeholder={t('ws-user-groups.select_group_placeholder')}
                  value={query}
                  onValueChange={setQuery}
                />
                <CommandList>
                  {reportGroupsQuery.isLoading ? (
                    <div className="py-6 text-center text-muted-foreground text-sm">
                      {tc('loading')}
                    </div>
                  ) : groups.length > 0 ? (
                    <CommandGroup>
                      {groups.map((group) => (
                        <CommandItem
                          key={group.id}
                          value={group.name || ''}
                          onSelect={() => {
                            setFilterParams({
                              groupId: group.id,
                              userId: null,
                              reportId: null,
                            });
                            setOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              'mr-2 h-4 w-4',
                              selectedGroupId === group.id
                                ? 'opacity-100'
                                : 'opacity-0'
                            )}
                          />
                          <span className="flex items-center gap-2">
                            {group.name}
                            {group.id && (
                              <ReportStatusIndicator
                                counts={groupStatusMap.get(group.id)}
                              />
                            )}
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  ) : (
                    <CommandEmpty>{tc('no_results_found')}</CommandEmpty>
                  )}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          {selectedGroupManagers.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground text-sm">
                {t('ws-user-groups.managers')}:
              </span>
              {selectedGroupManagers.map((manager) => (
                <Link
                  key={manager.id}
                  href={`/${wsId}/users/database/${manager.id}`}
                >
                  <Badge variant="secondary" className="hover:bg-secondary/80">
                    {manager.full_name}
                  </Badge>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {selectedGroupId && selectedGroup && (
        <>
          <Separator />
          <GroupReportsClient
            wsId={wsId}
            groupId={selectedGroupId}
            groupNameFallback={selectedGroup.name || ''}
            canCheckUserAttendance={canCheckUserAttendance}
            canApproveReports={canApproveReports}
            canCreateReports={canCreateReports}
            canUpdateReports={canUpdateReports}
            canDeleteReports={canDeleteReports}
          />
        </>
      )}
    </div>
  );
}
