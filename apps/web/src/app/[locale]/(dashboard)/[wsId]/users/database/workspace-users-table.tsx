'use client';

import { Loader2 } from '@tuturuuu/icons';
import { useQueryClient } from '@tanstack/react-query';
import type { WorkspaceUserField } from '@tuturuuu/types/primitives/WorkspaceUserField';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { DataTable } from '@tuturuuu/ui/custom/tables/data-table';
import { Label } from '@tuturuuu/ui/label';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { parseAsInteger, parseAsString, useQueryState } from 'nuqs';
import { useCallback } from 'react';
import { ClientFilters } from './client-filters';
import { getUserColumns } from './columns';
import { useWorkspaceUsers, type WorkspaceUsersResponse } from './hooks';

interface Props {
  wsId: string;
  locale: string;
  extraFields: WorkspaceUserField[];
  permissions: {
    hasPrivateInfo: boolean;
    hasPublicInfo: boolean;
    canCreateUsers: boolean;
    canUpdateUsers: boolean;
    canDeleteUsers: boolean;
    canCheckUserAttendance: boolean;
  };
  initialData: WorkspaceUsersResponse;
  toolbarImportContent?: React.ReactNode;
  toolbarExportContent?: React.ReactNode;
}

export function WorkspaceUsersTable({
  wsId,
  locale,
  extraFields,
  permissions,
  initialData,
  toolbarImportContent,
  toolbarExportContent,
}: Props) {
  const t = useTranslations();
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const queryClient = useQueryClient();

  // Use nuqs for URL state management (shallow: true for client-side only)
  const [q, setQ] = useQueryState(
    'q',
    parseAsString.withDefault('').withOptions({
      shallow: true,
      throttleMs: 300,
    })
  );

  const [page, setPage] = useQueryState(
    'page',
    parseAsInteger.withDefault(1).withOptions({
      shallow: true,
    })
  );

  const [pageSize, setPageSize] = useQueryState(
    'pageSize',
    parseAsInteger.withDefault(10).withOptions({
      shallow: true,
    })
  );

  const [includeArchived, setIncludeArchived] = useQueryState(
    'includeArchived',
    parseAsString.withDefault('false').withOptions({
      shallow: true,
    })
  );

  // Compute pageIndex from 1-based page
  const pageIndex = page > 0 ? page - 1 : 0;

  // Parse array params for filters (nuqs doesn't handle arrays well, use searchParams)
  const includedGroups = searchParams.getAll('includedGroups');
  const excludedGroups = searchParams.getAll('excludedGroups');

  // Fetch data with React Query
  const { data, isLoading, isFetching, error } = useWorkspaceUsers(
    wsId,
    {
      q,
      page,
      pageSize,
      includedGroups,
      excludedGroups,
      includeArchived: includeArchived === 'true',
    },
    {
      // Use initial data for first render (SSR hydration)
      initialData:
        !q &&
        page === 1 &&
        pageSize === 10 &&
        includedGroups.length === 0 &&
        excludedGroups.length === 0 &&
        includeArchived === 'false'
          ? initialData
          : undefined,
    }
  );

  // Add href for navigation to each user
  const users = data?.data
    ? data.data.map((u) => ({
        ...u,
        href: `/${wsId}/users/database/${u.id}`,
      }))
    : isLoading
      ? undefined
      : [];

  const extraData = {
    locale,
    wsId,
    hasPrivateInfo: permissions.hasPrivateInfo,
    hasPublicInfo: permissions.hasPublicInfo,
    canCreateUsers: permissions.canCreateUsers,
    canUpdateUsers: permissions.canUpdateUsers,
    canDeleteUsers: permissions.canDeleteUsers,
    canCheckUserAttendance: permissions.canCheckUserAttendance,
  };

  // Handler for search - uses nuqs setQ
  const handleSearch = useCallback(
    (query: string) => {
      setQ(query || null);
      setPage(1); // Reset to first page on search
    },
    [setQ, setPage]
  );

  // Handler for pagination params - uses nuqs setters
  const handleSetParams = useCallback(
    (params: { page?: number; pageSize?: string }) => {
      if (params.page !== undefined) {
        setPage(params.page);
      }
      if (params.pageSize !== undefined) {
        setPageSize(Number(params.pageSize));
      }
    },
    [setPage, setPageSize]
  );

  // Handler for reset - clears all nuqs state
  const handleResetParams = useCallback(() => {
    setQ(null);
    setPage(null);
    setPageSize(null);
    setIncludeArchived(null);
    // Also clear filter params not managed by nuqs
    router.push(pathname);
  }, [setQ, setPage, setPageSize, setIncludeArchived, router, pathname]);

  if (error) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-destructive">
          Error loading users. Please try again.
        </p>
      </div>
    );
  }

  // Show loading overlay when fetching new data (but not on initial load)
  const showLoadingOverlay = isFetching && !isLoading;

  return (
    <div className="relative">
      {/* Loading overlay on table when fetching */}
      {showLoadingOverlay && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/50 backdrop-blur-[1px]">
          <div className="flex items-center gap-2 rounded-md border bg-background/90 px-4 py-2 shadow-lg">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-muted-foreground text-sm">Loading...</span>
          </div>
        </div>
      )}

      <DataTable
        t={t}
        data={users}
        namespace="user-data-table"
        columnGenerator={getUserColumns}
        extraColumns={extraFields}
        extraData={extraData}
        count={data?.count ?? 0}
        pageIndex={pageIndex}
        pageSize={pageSize}
        defaultQuery={q}
        filters={
          <div className="flex items-center gap-4">
            <ClientFilters
              wsId={wsId}
              includedGroups={includedGroups}
              excludedGroups={excludedGroups}
            />
            <div className="flex items-center gap-2">
              <Checkbox
                id="include-archived"
                checked={includeArchived === 'true'}
                onCheckedChange={(checked) => {
                  setIncludeArchived(checked ? 'true' : 'false');
                  setPage(1); // Reset to first page when toggling
                }}
              />
              <Label
                htmlFor="include-archived"
                className="cursor-pointer font-normal text-sm"
              >
                {t('ws-users.include_archived')}
              </Label>
            </div>
          </div>
        }
        toolbarImportContent={toolbarImportContent}
        toolbarExportContent={toolbarExportContent}
        onSearch={handleSearch}
        setParams={handleSetParams}
        resetParams={handleResetParams}
        isEmpty={searchParams.toString().length === 0}
        onRefresh={() => {
          queryClient.invalidateQueries({
            queryKey: ['workspace-users', wsId],
          });
        }}
        defaultVisibility={{
          id: false,
          gender: false,
          display_name: false,
          ethnicity: false,
          guardian: false,
          address: false,
          national_id: false,
          note: false,
          linked_users: false,
          group_count: false,
          created_at: false,
          updated_at: false,
          avatar_url: false,
          // Extra columns
          ...Object.fromEntries(extraFields.map((field) => [field.id, false])),
        }}
      />
    </div>
  );
}
