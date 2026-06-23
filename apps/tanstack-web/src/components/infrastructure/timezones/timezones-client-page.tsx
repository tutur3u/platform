'use client';

import type { VisibilityState } from '@tanstack/react-table';
import { Loader2, Plus } from '@tuturuuu/icons';
import type {
  BackendInfrastructureTimezoneCreateRequest,
  BackendInfrastructureTimezoneWriteRequest,
} from '@tuturuuu/internal-api/backend';
import type { Timezone } from '@tuturuuu/types/primitives/Timezone';
import { Button } from '@tuturuuu/ui/button';
import {
  DataTable,
  type DataTableProps,
} from '@tuturuuu/ui/custom/tables/data-table';
import { useCallback, useMemo, useState } from 'react';
import {
  usePathname,
  useRouter,
  useSearchParams,
} from '../../../lib/platform/next-navigation-shim';
import { getTimezoneColumns } from './columns';
import { resolveTimezoneLabels } from './labels';
import { TimezoneFormDialog } from './timezone-form-dialog';
import { normalizeTimezoneRows } from './timezone-utils';
import {
  type TimezonesActionResult,
  useTimezonesActions,
} from './timezones-actions';
import type { TimezoneManagementRow, TimezoneTableTranslator } from './types';

type TimezonesClientPageProps = {
  count: number;
  createTimezone: (
    values: BackendInfrastructureTimezoneCreateRequest
  ) => Promise<TimezonesActionResult>;
  data: Timezone[];
  deleteTimezone: (timezoneId: string) => Promise<TimezonesActionResult>;
  page: number;
  pageSize: number;
  q: string;
  refreshTimezones?: () => Promise<Timezone[]>;
  updateTimezone: (
    timezoneId: string,
    values: BackendInfrastructureTimezoneWriteRequest
  ) => Promise<TimezonesActionResult>;
  workspaceId: string;
};

const DEFAULT_VISIBILITY: VisibilityState = {
  abbr: false,
  created_at: false,
  id: false,
  isdst: false,
  utc: false,
};

function buildHref(pathname: string, params: URLSearchParams) {
  const query = params.toString();

  return query ? `${pathname}?${query}` : pathname;
}

export function TimezonesClientPage({
  count,
  createTimezone,
  data,
  deleteTimezone,
  page,
  pageSize,
  q,
  updateTimezone,
  workspaceId,
}: TimezonesClientPageProps) {
  const labels = useMemo(() => resolveTimezoneLabels(), []);
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [createOpen, setCreateOpen] = useState(false);
  const tableRows = useMemo(() => normalizeTimezoneRows(data), [data]);
  const translate = useCallback<TimezoneTableTranslator>(
    ((key: string) => labels.table[key] ?? key) as TimezoneTableTranslator,
    [labels.table]
  );
  const {
    createPending,
    handleCreate,
    handleDelete,
    handleSync,
    handleUpdate,
    isMutating,
    refreshRouteData,
  } = useTimezonesActions({
    createTimezone,
    deleteTimezone,
    labels,
    onCreateSuccess: () => setCreateOpen(false),
    updateTimezone,
    workspaceId,
  });

  const updateSearchParams = useCallback(
    (updates: Record<string, number | string | undefined>) => {
      const nextParams = new URLSearchParams(searchParams);

      for (const [key, value] of Object.entries(updates)) {
        if (value === undefined || value === '') {
          nextParams.delete(key);
        } else {
          nextParams.set(key, String(value));
        }
      }

      router.push(buildHref(pathname, nextParams));
    },
    [pathname, router, searchParams]
  );

  const handleSearch = useCallback(
    (query: string) => {
      updateSearchParams({
        page: 1,
        q: query || undefined,
      });
    },
    [updateSearchParams]
  );

  const handleSetParams = useCallback(
    (
      params: Parameters<
        NonNullable<DataTableProps<TimezoneManagementRow, unknown>['setParams']>
      >[0]
    ) => {
      updateSearchParams({
        page: params.page,
        pageSize: params.pageSize,
      });
    },
    [updateSearchParams]
  );

  const handleResetParams = useCallback(() => {
    router.push(pathname);
  }, [pathname, router]);

  const toolbarActions = (
    <TimezoneFormDialog
      isPending={createPending}
      labels={labels}
      mode="create"
      onOpenChange={setCreateOpen}
      onSubmit={handleCreate}
      open={createOpen}
      trigger={
        <Button className="h-8 w-full md:w-fit" disabled={isMutating} size="sm">
          <Plus className="h-4 w-4" />
          {labels.actions.create}
        </Button>
      }
    />
  );

  return (
    <div className="relative">
      {isMutating ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/50 backdrop-blur-[1px]">
          <div className="flex items-center gap-2 rounded-md border bg-background/90 px-4 py-2 shadow-lg">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-muted-foreground text-sm">
              {labels.actions.saving}
            </span>
          </div>
        </div>
      ) : null}

      <DataTable
        columnGenerator={getTimezoneColumns}
        count={count}
        data={tableRows}
        defaultQuery={q}
        defaultVisibility={DEFAULT_VISIBILITY}
        extraData={{
          isMutating,
          labels,
          onDelete: handleDelete,
          onSync: handleSync,
          onUpdate: handleUpdate,
        }}
        isFiltered={Boolean(q)}
        namespace="timezone-data-table"
        onRefresh={() => {
          void refreshRouteData();
        }}
        onSearch={handleSearch}
        pageIndex={page - 1}
        pageSize={pageSize}
        resetParams={handleResetParams}
        setParams={handleSetParams}
        t={translate}
        toolbarActions={toolbarActions}
      />
    </div>
  );
}
