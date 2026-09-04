'use client';

import { useQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown, Loader2 } from '@tuturuuu/icons';
import { listWorkspaceReportGroups } from '@tuturuuu/internal-api/reports';
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
import { useMemo, useState } from 'react';
import GroupReportsClient from '../groups/[groupId]/reports/client';
import {
  type ReportStatusCounts,
  ReportStatusIndicator,
} from './components/report-status-indicator';

type SearchableReportGroupsResponse = Awaited<
  ReturnType<typeof listWorkspaceReportGroups>
> & { hasMore: boolean };

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
    queryFn: () =>
      listWorkspaceReportGroups(wsId, {
        query: debouncedQuery || undefined,
        selectedGroupId,
      }) as Promise<SearchableReportGroupsResponse>,
    enabled: Boolean(wsId && (open || selectedGroupId)),
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

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex flex-col gap-2">
          <Popover
            open={open}
            onOpenChange={(nextOpen) => {
              setOpen(nextOpen);
              if (!nextOpen) setQuery('');
            }}
          >
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={open}
                className="w-full justify-between"
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
                  placeholder={t('reports-hub.search_groups_placeholder')}
                  value={query}
                  onValueChange={setQuery}
                />
                <CommandList>
                  {reportGroupsQuery.isLoading ||
                  (reportGroupsQuery.isFetching && groups.length === 0) ? (
                    <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground text-sm">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t('reports-hub.searching')}
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
                      {reportGroupsQuery.data?.hasMore ? (
                        <div className="border-t px-3 py-2 text-muted-foreground text-xs">
                          {t('reports-hub.refine_group_search')}
                        </div>
                      ) : null}
                    </CommandGroup>
                  ) : (
                    <CommandEmpty>{tc('no_results_found')}</CommandEmpty>
                  )}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          {!selectedGroup ? (
            <p className="text-muted-foreground text-sm">
              {t('reports-hub.group_search_help')}
            </p>
          ) : null}

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
