'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from '@tuturuuu/icons';
import { DataTable } from '@tuturuuu/ui/custom/tables/data-table';
import { useTranslations } from 'next-intl';
import {
  parseAsArrayOf,
  parseAsInteger,
  parseAsString,
  useQueryState,
} from 'nuqs';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef } from 'react';
import { useUserConfig } from '@/hooks/use-user-config';
import {
  DATABASE_DEFAULT_GROUP_MEMBERSHIP_CONFIG_ID,
  DATABASE_DEFAULT_LINK_STATUS_CONFIG_ID,
  DEFAULT_DATABASE_GROUP_MEMBERSHIP,
  DEFAULT_DATABASE_LINK_STATUS,
  parseDatabaseGroupMembership,
  parseDatabaseLinkStatus,
} from '@/lib/users-database-filters';
import { getUserColumns } from './columns';
import ExportDialogContent from './export-dialog-content';
import {
  useDefaultExcludedGroups,
  useDefaultIncludedGroups,
  useWorkspaceUserFields,
  useWorkspaceUsers,
} from './hooks';
import { resolveUsersDatabaseFilters } from './resolved-filters';
import { UsersFilterPanel } from './users-filter-panel';

interface Props {
  wsId: string;
  locale: string;
  permissions: {
    hasPrivateInfo: boolean;
    hasPublicInfo: boolean;
    canCreateUsers: boolean;
    canUpdateUsers: boolean;
    canDeleteUsers: boolean;
    canCheckUserAttendance: boolean;
  };
  canViewFeedbacks?: boolean;
  canManageFeedbacks?: boolean;
  initialDefaultExcludedGroups?: string[];
  initialDefaultIncludedGroups?: string[];
  initialFeaturedGroupIds?: string[];
  toolbarImportContent?: ReactNode;
  toolbarActions?: ReactNode;
  canExport?: boolean;
}

export function WorkspaceUsersTable({
  wsId,
  locale,
  permissions,
  canViewFeedbacks = false,
  canManageFeedbacks = false,
  initialDefaultExcludedGroups = [],
  initialDefaultIncludedGroups = [],
  initialFeaturedGroupIds = [],
  toolbarImportContent,
  toolbarActions,
  canExport = false,
}: Props) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const { data: savedLinkStatus, isLoading: isLoadingLinkStatus } =
    useUserConfig(
      DATABASE_DEFAULT_LINK_STATUS_CONFIG_ID,
      DEFAULT_DATABASE_LINK_STATUS
    );
  const { data: savedGroupMembership, isLoading: isLoadingGroupMembership } =
    useUserConfig(
      DATABASE_DEFAULT_GROUP_MEMBERSHIP_CONFIG_ID,
      DEFAULT_DATABASE_GROUP_MEMBERSHIP
    );

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
    parseAsString.withOptions({
      shallow: true,
    })
  );

  const [requireAttention, setRequireAttention] = useQueryState(
    'requireAttention',
    parseAsString.withDefault('all').withOptions({
      shallow: true,
    })
  );

  const [groupMembership, setGroupMembership] = useQueryState(
    'groupMembership',
    parseAsString.withOptions({
      shallow: true,
    })
  );

  const defaultLinkStatus = parseDatabaseLinkStatus(
    savedLinkStatus,
    DEFAULT_DATABASE_LINK_STATUS
  );
  const defaultGroupMembership = parseDatabaseGroupMembership(
    savedGroupMembership,
    DEFAULT_DATABASE_GROUP_MEMBERSHIP
  );
  const effectiveLinkStatus = parseDatabaseLinkStatus(
    linkStatus,
    defaultLinkStatus
  );
  const effectiveGroupMembership = parseDatabaseGroupMembership(
    groupMembership,
    defaultGroupMembership
  );

  const [includedGroups, setIncludedGroups] = useQueryState(
    'includedGroups',
    parseAsArrayOf(parseAsString).withDefault([]).withOptions({
      shallow: true,
    })
  );

  const [excludedGroups, setExcludedGroups] = useQueryState(
    'excludedGroups',
    parseAsArrayOf(parseAsString).withOptions({
      shallow: true,
    })
  );

  const { data: defaultIncludedGroups, isLoading: isLoadingIncludedDefaults } =
    useDefaultIncludedGroups(wsId, {
      initialData: initialDefaultIncludedGroups,
    });
  const { data: defaultExcludedGroups, isLoading: isLoadingDefaults } =
    useDefaultExcludedGroups(wsId, {
      initialData: initialDefaultExcludedGroups,
    });
  const { data: extraFieldsData, isLoading: isLoadingFields } =
    useWorkspaceUserFields(wsId);

  // Track if defaults have been applied (prevents re-apply on clear)
  const hasAppliedDefaultIncludedGroups = useRef(false);
  const hasAppliedDefaultExcludedGroups = useRef(false);

  const shouldApplyDefaultIncludedGroups =
    !isLoadingIncludedDefaults &&
    !hasAppliedDefaultIncludedGroups.current &&
    includedGroups.length === 0 &&
    !!defaultIncludedGroups &&
    defaultIncludedGroups.length > 0;

  const shouldApplyDefaultExcludedGroups =
    !isLoadingDefaults &&
    !hasAppliedDefaultExcludedGroups.current && // Only apply once per session
    excludedGroups === null &&
    !!defaultExcludedGroups &&
    defaultExcludedGroups.length > 0;

  const isUserDefaultsReady = !isLoadingLinkStatus && !isLoadingGroupMembership;
  const isInitialized =
    !isLoadingDefaults && !isLoadingIncludedDefaults && isUserDefaultsReady;

  const resolvedFilters = resolveUsersDatabaseFilters({
    q,
    includedGroups,
    excludedGroups,
    status,
    linkStatus,
    requireAttention,
    groupMembership,
    defaultIncludedGroups,
    defaultExcludedGroups,
    hasAppliedDefaultIncludedGroups: hasAppliedDefaultIncludedGroups.current,
    hasAppliedDefaultExcludedGroups: hasAppliedDefaultExcludedGroups.current,
    defaultLinkStatus,
    defaultGroupMembership,
  });

  // Apply default included groups to URL state on mount if no inclusions set
  useEffect(() => {
    if (!shouldApplyDefaultIncludedGroups) return;
    hasAppliedDefaultIncludedGroups.current = true;
    void setIncludedGroups(defaultIncludedGroups);
  }, [
    defaultIncludedGroups,
    setIncludedGroups,
    shouldApplyDefaultIncludedGroups,
  ]);

  // Apply default excluded groups to URL state on mount if no exclusions set
  useEffect(() => {
    if (!shouldApplyDefaultExcludedGroups) return;
    hasAppliedDefaultExcludedGroups.current = true;
    void setExcludedGroups(defaultExcludedGroups);
  }, [
    defaultExcludedGroups,
    setExcludedGroups,
    shouldApplyDefaultExcludedGroups,
  ]);

  useEffect(() => {
    if (!isUserDefaultsReady || linkStatus !== null) return;
    if (defaultLinkStatus === DEFAULT_DATABASE_LINK_STATUS) return;
    void setLinkStatus(effectiveLinkStatus);
  }, [
    defaultLinkStatus,
    effectiveLinkStatus,
    isUserDefaultsReady,
    linkStatus,
    setLinkStatus,
  ]);

  useEffect(() => {
    if (!isUserDefaultsReady || groupMembership !== null) return;
    if (defaultGroupMembership === DEFAULT_DATABASE_GROUP_MEMBERSHIP) return;
    void setGroupMembership(effectiveGroupMembership);
  }, [
    defaultGroupMembership,
    effectiveGroupMembership,
    groupMembership,
    isUserDefaultsReady,
    setGroupMembership,
  ]);

  // Compute pageIndex from 1-based page
  const pageIndex = page > 0 ? page - 1 : 0;

  // Fetch data with React Query
  const { data, isLoading, isFetching, error } = useWorkspaceUsers(
    wsId,
    {
      q: resolvedFilters.q,
      page,
      pageSize,
      includedGroups: resolvedFilters.includedGroups,
      excludedGroups: resolvedFilters.excludedGroups,
      status: resolvedFilters.status,
      linkStatus: resolvedFilters.linkStatus,
      requireAttention: resolvedFilters.requireAttention,
      groupMembership: resolvedFilters.groupMembership,
    },
    {
      enabled: isInitialized,
    }
  );

  const extraFields = extraFieldsData ?? [];

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
    canViewFeedbacks,
    canManageFeedbacks,
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
    setRequireAttention(null);
    setGroupMembership(null);
    setIncludedGroups(null);
    setExcludedGroups(null);
  }, [
    setQ,
    setPage,
    setPageSize,
    setStatus,
    setLinkStatus,
    setRequireAttention,
    setGroupMembership,
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
  const showLoadingOverlay =
    (isFetching && !isLoading) || !isInitialized || isLoadingFields;

  return (
    <div className="relative">
      {/* Loading overlay on table when fetching */}
      {showLoadingOverlay && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/50 backdrop-blur-[1px]">
          <div className="flex items-center gap-2 rounded-md border bg-background/90 px-4 py-2 shadow-lg">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-muted-foreground text-sm">
              {!isInitialized ? t('common.initializing') : t('common.loading')}
            </span>
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
          <UsersFilterPanel
            wsId={wsId}
            status={status as 'active' | 'archived' | 'archived_until' | 'all'}
            linkStatus={effectiveLinkStatus}
            requireAttention={requireAttention as 'all' | 'true' | 'false'}
            groupMembership={effectiveGroupMembership}
            effectiveExcludedGroups={resolvedFilters.excludedGroups}
            initialFeaturedGroupIds={initialFeaturedGroupIds}
            onStatusChange={(val) => {
              setStatus(val);
              setPage(1);
            }}
            onLinkStatusChange={(val) => {
              setLinkStatus(val === defaultLinkStatus ? null : val);
              setPage(1);
            }}
            onRequireAttentionChange={(val) => {
              setRequireAttention(val);
              setPage(1);
            }}
            onGroupMembershipChange={(val) => {
              setGroupMembership(val === defaultGroupMembership ? null : val);
              setPage(1);
            }}
          />
        }
        toolbarImportContent={toolbarImportContent}
        toolbarExportContent={
          canExport ? (
            <ExportDialogContent
              wsId={wsId}
              exportType="users"
              showDataTypeSelector
              filters={resolvedFilters}
            />
          ) : undefined
        }
        toolbarActions={toolbarActions}
        onSearch={handleSearch}
        setParams={handleSetParams}
        resetParams={handleResetParams}
        isFiltered={
          !!resolvedFilters.q ||
          resolvedFilters.status !== 'active' ||
          resolvedFilters.linkStatus !== defaultLinkStatus ||
          resolvedFilters.requireAttention !== 'all' ||
          resolvedFilters.groupMembership !== defaultGroupMembership ||
          resolvedFilters.includedGroups.length > 0 ||
          resolvedFilters.excludedGroups.length > 0
        }
        onRefresh={() => {
          queryClient.invalidateQueries({
            queryKey: ['workspace-users', wsId],
          });
          queryClient.invalidateQueries({
            queryKey: ['workspace-user-fields', wsId],
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
