'use client';

import { WorkspaceApprovalRequest } from './approvals-table';
import { ApprovalRowActions } from './row-actions';
import { ColumnDef } from '@tanstack/react-table';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import { BookOpenText, User } from '@tuturuuu/ui/icons';
import {
  getRequestableFeature,
  getRequestableKeyFromFeatureFlag,
} from '@tuturuuu/utils/feature-flags/requestable-features';
import type { FeatureFlag } from '@tuturuuu/utils/feature-flags/types';
import { cn } from '@tuturuuu/utils/format';
import moment from 'moment';

export const approvalsColumns = (
  t: any,
  namespace: string | undefined,
  onRefresh?: () => void
): ColumnDef<WorkspaceApprovalRequest>[] => [
  {
    accessorKey: 'id',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.id`)}
      />
    ),
    cell: ({ row }) => (
      <div className="line-clamp-1 max-w-32 font-mono text-xs break-all text-muted-foreground">
        {row.getValue('id')}
      </div>
    ),
  },
  {
    accessorKey: 'workspace_name',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.workspace`)}
      />
    ),
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-dynamic-blue/10">
          <BookOpenText className="h-4 w-4 text-dynamic-blue" />
        </div>
        <div className="line-clamp-1 max-w-48 font-semibold break-words">
          {row.getValue('workspace_name')}
        </div>
      </div>
    ),
  },
  {
    accessorKey: 'creator_name',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.requested_by`)}
      />
    ),
    cell: ({ row }) => {
      const creatorName = row.getValue('creator_name') as string;
      const creatorEmail = row.original.creator_email;
      const creatorAvatar = row.original.creator_avatar;

      return (
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarImage src={creatorAvatar} alt={creatorName} />
            <AvatarFallback className="bg-dynamic-blue/10 text-dynamic-blue">
              <User className="h-4 w-4" />
            </AvatarFallback>
          </Avatar>
          <div className="flex max-w-48 flex-col gap-0.5">
            <div className="line-clamp-1 text-sm font-medium break-words">
              {creatorName}
            </div>
            {creatorEmail && (
              <div className="line-clamp-1 text-xs break-words text-muted-foreground">
                {creatorEmail}
              </div>
            )}
          </div>
        </div>
      );
    },
  },
  {
    accessorKey: 'feature_requested',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.feature_requested`)}
      />
    ),
    cell: ({ row }) => {
      const featureRequested = row.getValue('feature_requested') as string;

      // Try to get the feature configuration
      let featureConfig = null;
      let FeatureIcon = BookOpenText; // Default icon

      // Use the type-safe helper function to get the requestable key from feature flag
      const requestableKey = getRequestableKeyFromFeatureFlag(
        featureRequested as FeatureFlag
      );

      if (requestableKey) {
        featureConfig = getRequestableFeature(requestableKey);
        if (featureConfig?.icon) {
          FeatureIcon = featureConfig.icon;
        }
      }

      return (
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-dynamic-blue/10">
            <FeatureIcon className="h-4 w-4 text-dynamic-blue" />
          </div>
          <div className="flex flex-col">
            <div className="text-sm font-medium text-dynamic-blue">
              {featureConfig?.name || featureRequested}
            </div>
            <div className="text-xs text-muted-foreground">
              {featureRequested}
            </div>
          </div>
        </div>
      );
    },
  },
  {
    accessorKey: 'request_message',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.request_details`)}
      />
    ),
    cell: ({ row }) => (
      <div className="max-w-64">
        <div className="line-clamp-3 text-sm break-words text-muted-foreground">
          {row.getValue('request_message')}
        </div>
      </div>
    ),
  },
  {
    accessorKey: 'status',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.status`)}
      />
    ),
    cell: ({ row }) => {
      const status = row.getValue('status') as string;
      const reviewedAt = row.original.reviewed_at;
      const reviewedByName = row.original.reviewed_by_name;

      return (
        <div className="space-y-1">
          <Badge
            variant="secondary"
            className={cn(
              'font-medium capitalize',
              status === 'approved' &&
                'border-green-200 bg-green-100 text-green-800 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400',
              status === 'rejected' &&
                'border-red-200 bg-red-100 text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400',
              status === 'pending' &&
                'border-yellow-200 bg-yellow-100 text-yellow-800 dark:border-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400'
            )}
          >
            {t(`${namespace}.status-${status}`)}
          </Badge>
          {reviewedAt && reviewedByName && (
            <div className="text-xs text-muted-foreground">
              {t(`${namespace}.reviewed_by`, { name: reviewedByName })}
            </div>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: 'created_at',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.created_at`)}
      />
    ),
    cell: ({ row }) => {
      const createdAt = row.getValue('created_at') as string;
      const reviewedAt = row.original.reviewed_at;

      return (
        <div className="space-y-1 text-sm">
          <div className="text-muted-foreground">
            {createdAt ? moment(createdAt).format('MMM DD, YYYY') : '-'}
          </div>
          <div className="text-xs text-muted-foreground">
            {createdAt ? moment(createdAt).format('HH:mm') : ''}
          </div>
          {reviewedAt && (
            <div className="text-xs text-dynamic-blue">
              {t(`${namespace}.reviewed_at`, {
                date: moment(reviewedAt).format('MMM DD'),
              })}
            </div>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: 'admin_notes',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.admin_notes`)}
      />
    ),
    cell: ({ row }) => {
      const adminNotes = row.getValue('admin_notes') as string;

      return (
        <div className="max-w-48">
          {adminNotes ? (
            <div className="line-clamp-2 text-sm break-words text-muted-foreground">
              {adminNotes}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground italic">
              {t(`${namespace}.no_notes`)}
            </div>
          )}
        </div>
      );
    },
  },
  {
    id: 'actions',
    header: ({ column }) => <DataTableColumnHeader t={t} column={column} />,
    cell: ({ row }) => <ApprovalRowActions row={row} onRefresh={onRefresh} />,
  },
];
