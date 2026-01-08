'use client';

import { Loader2 } from '@tuturuuu/icons';
import type { WorkspaceUserField } from '@tuturuuu/types/primitives/WorkspaceUserField';
import { CustomDataTable } from '@tuturuuu/ui/custom/tables/custom-data-table';
import { useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  parseAsInteger,
  parseAsString,
  useQueryState,
} from 'nuqs';
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const queryClient = useQueryClient();

  const [q, setQ] = useQueryState(
    'q',
    parseAsString.withDefault('').withOptions({
      shallow: true,
      throttleMs: 500,
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

  // Parse array params (keep using searchParams for array compatibility with Filters)
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
    },
    {
      // Use initial data for first render (SSR hydration)
      initialData:
        !q &&
        page === 1 &&
        pageSize === 10 &&
        includedGroups.length === 0 &&
        excludedGroups.length === 0
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

  if (error) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-destructive">
          Error loading users. Please try again.
        </p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Show subtle loading indicator when refetching */}
      {isFetching && !isLoading && (
        <div className="absolute top-0 right-0 z-10 p-2">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}

      <CustomDataTable
        data={users}
        namespace="user-data-table"
        columnGenerator={getUserColumns}
        extraColumns={extraFields}
        extraData={extraData}
        count={data?.count ?? 0}
        filters={
          <ClientFilters
            wsId={wsId}
            includedGroups={includedGroups}
            excludedGroups={excludedGroups}
          />
        }
        toolbarImportContent={toolbarImportContent}
        toolbarExportContent={toolbarExportContent}
        onSearch={(query) => {
          setQ(query ? query : null);
          setPage(1);
        }}
        setParams={async (params) => {
          if (params.page !== undefined) await setPage(params.page);
          if (params.pageSize !== undefined)
            await setPageSize(Number(params.pageSize));
          // Handle sorting if needed in future
        }}
        resetParams={() => {
          setQ(null);
          setPage(null);
          setPageSize(null);
          // Note: This doesn't reset filters managed by external component
          router.push(pathname);
        }}
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
