'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  Archive,
  Clock,
  GitMerge,
  Layers,
  Link,
  Link2Off,
  Loader2,
  Users,
} from '@tuturuuu/icons';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import type { WorkspaceUserField } from '@tuturuuu/types/primitives/WorkspaceUserField';
import { Button } from '@tuturuuu/ui/button';
import { DataTable } from '@tuturuuu/ui/custom/tables/data-table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useTranslations } from 'next-intl';
import {
  parseAsArrayOf,
  parseAsInteger,
  parseAsString,
  useQueryState,
} from 'nuqs';
import { useCallback, useState } from 'react';
import { useUserStatusLabels } from '@/hooks/use-user-status-labels';
import { ClientFilters } from './client-filters';
import { getUserColumns } from './columns';
import { DuplicateDetectionDialog } from './duplicate-detection-dialog';
import { useWorkspaceUsers, type WorkspaceUsersResponse } from './hooks';
import { MergePreviewDialog } from './merge-preview-dialog';

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
    canMergeUsers: boolean;
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
  const userStatusLabels = useUserStatusLabels(wsId);
  const queryClient = useQueryClient();

  // State for merge selected users dialog
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [selectedForMerge, setSelectedForMerge] = useState<{
    keepUser: WorkspaceUser;
    deleteUser: WorkspaceUser;
  } | null>(null);

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

  const [status, setStatus] = useQueryState(
    'status',
    parseAsString.withDefault('active').withOptions({
      shallow: true,
    })
  );

  const [linkStatus, setLinkStatus] = useQueryState(
    'linkStatus',
    parseAsString.withDefault('all').withOptions({
      shallow: true,
    })
  );

  const [includedGroups, setIncludedGroups] = useQueryState(
    'includedGroups',
    parseAsArrayOf(parseAsString).withDefault([]).withOptions({
      shallow: true,
    })
  );

  const [excludedGroups, setExcludedGroups] = useQueryState(
    'excludedGroups',
    parseAsArrayOf(parseAsString).withDefault([]).withOptions({
      shallow: true,
    })
  );

  // Compute pageIndex from 1-based page
  const pageIndex = page > 0 ? page - 1 : 0;

  // Fetch data with React Query
  const { data, isLoading, isFetching, error } = useWorkspaceUsers(
    wsId,
    {
      q,
      page,
      pageSize,
      includedGroups,
      excludedGroups,
      status: status as 'active' | 'archived' | 'archived_until' | 'all',
      linkStatus: linkStatus as 'all' | 'linked' | 'virtual',
    },
    {
      // Use initial data for first render (SSR hydration)
      initialData:
        !q &&
        page === 1 &&
        pageSize === 10 &&
        includedGroups.length === 0 &&
        excludedGroups.length === 0 &&
        status === 'active' &&
        linkStatus === 'all'
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
    canMergeUsers: permissions.canMergeUsers,
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
    setStatus(null);
    setLinkStatus(null);
    setIncludedGroups(null);
    setExcludedGroups(null);
  }, [
    setQ,
    setPage,
    setPageSize,
    setStatus,
    setLinkStatus,
    setIncludedGroups,
    setExcludedGroups,
  ]);

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
          <div className="flex items-center gap-2">
            <Select
              value={status}
              onValueChange={(val) => {
                setStatus(val);
                setPage(1); // Reset to first page when toggling
              }}
            >
              <SelectTrigger className="h-8 w-37.5 border-dashed bg-background">
                <SelectValue placeholder={t('ws-users.status_filter')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4" />
                    <span>{t('ws-users.status_active')}</span>
                  </div>
                </SelectItem>
                <SelectItem value="archived">
                  <div className="flex items-center gap-2">
                    <Archive className="h-4 w-4" />
                    <span>{userStatusLabels.archived}</span>
                  </div>
                </SelectItem>
                <SelectItem value="archived_until">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    <span>{userStatusLabels.archived_until}</span>
                  </div>
                </SelectItem>
                <SelectItem value="all">
                  <div className="flex items-center gap-2">
                    <Layers className="h-4 w-4" />
                    <span>{t('ws-users.status_all')}</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={linkStatus}
              onValueChange={(val) => {
                setLinkStatus(val);
                setPage(1); // Reset to first page when toggling
              }}
            >
              <SelectTrigger className="h-8 w-37.5 border-dashed bg-background">
                <SelectValue placeholder={t('ws-users.link_status_filter')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    <span>{t('ws-users.link_status_all')}</span>
                  </div>
                </SelectItem>
                <SelectItem value="linked">
                  <div className="flex items-center gap-2">
                    <Link className="h-4 w-4" />
                    <span>{t('ws-users.link_status_linked')}</span>
                  </div>
                </SelectItem>
                <SelectItem value="virtual">
                  <div className="flex items-center gap-2">
                    <Link2Off className="h-4 w-4" />
                    <span>{t('ws-users.link_status_virtual')}</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
            <ClientFilters
              wsId={wsId}
              includedGroups={includedGroups}
              excludedGroups={excludedGroups}
              setIncludedGroups={setIncludedGroups}
              setExcludedGroups={setExcludedGroups}
            />
            {permissions.hasPrivateInfo && (
              <DuplicateDetectionDialog
                wsId={wsId}
                canMerge={permissions.canMergeUsers}
              />
            )}
          </div>
        }
        toolbarImportContent={toolbarImportContent}
        toolbarExportContent={toolbarExportContent}
        onSearch={handleSearch}
        setParams={handleSetParams}
        resetParams={handleResetParams}
        isFiltered={
          !!q ||
          status !== 'active' ||
          linkStatus !== 'all' ||
          includedGroups.length > 0 ||
          excludedGroups.length > 0
        }
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
        selectedRowsActions={
          permissions.canMergeUsers
            ? (selectedRows) => {
                // Only show merge button when exactly 2 users are selected
                if (selectedRows.length !== 2) return null;

                return (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() => {
                      const [a, b] = selectedRows as WorkspaceUser[];
                      // Older user (by created_at) becomes "keep", newer becomes "delete"
                      const aDate = new Date(a?.created_at || 0);
                      const bDate = new Date(b?.created_at || 0);
                      const keepUser = aDate < bDate ? a : b;
                      const deleteUser = keepUser === a ? b : a;
                      if (keepUser && deleteUser) {
                        setSelectedForMerge({ keepUser, deleteUser });
                        setMergeDialogOpen(true);
                      }
                    }}
                  >
                    <GitMerge className="mr-2 h-4 w-4" />
                    {t('ws-users.duplicates.merge_selected')}
                  </Button>
                );
              }
            : undefined
        }
      />

      {/* Merge Preview Dialog for selected users */}
      {selectedForMerge && (
        <MergePreviewDialog
          wsId={wsId}
          open={mergeDialogOpen}
          onOpenChange={(open) => {
            setMergeDialogOpen(open);
            if (!open) setSelectedForMerge(null);
          }}
          keepUser={selectedForMerge.keepUser}
          deleteUser={selectedForMerge.deleteUser}
          onMergeComplete={() => {
            queryClient.invalidateQueries({
              queryKey: ['workspace-users', wsId],
            });
            setMergeDialogOpen(false);
            setSelectedForMerge(null);
          }}
        />
      )}
    </div>
  );
}
