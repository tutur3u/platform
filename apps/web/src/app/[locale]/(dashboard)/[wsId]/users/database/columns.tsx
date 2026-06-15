'use client';

import type { ColumnDef } from '@tanstack/react-table';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import type { ColumnGeneratorOptions } from '@tuturuuu/ui/custom/tables/data-table';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { normalizeAvatarImageSrc } from '@tuturuuu/utils/avatar-url';
import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import 'dayjs/locale/vi';
import moment from 'moment';
import Link from 'next/link';
import { Fragment } from 'react';
import { RequireAttentionName } from '@/components/users/require-attention-name';
import { UserRowActions } from './row-actions';
import { UserAvatarCell } from './user-avatar-cell';

interface UserColumnsExtraData {
  hasPrivateInfo?: boolean;
  hasPublicInfo?: boolean;
  canCheckUserAttendance?: boolean;
  canUpdateUsers?: boolean;
  canDeleteUsers?: boolean;
  canViewFeedbacks?: boolean;
  canManageFeedbacks?: boolean;
  locale?: string;
}

export const getUserColumns = ({
  t,
  namespace,
  extraColumns: extraFields,
  extraData,
}: ColumnGeneratorOptions<WorkspaceUser> & {
  extraData?: UserColumnsExtraData;
}): ColumnDef<WorkspaceUser>[] => {
  const hasPrivateInfo = extraData?.hasPrivateInfo ?? false;
  const hasPublicInfo = extraData?.hasPublicInfo ?? false;
  const canCheckUserAttendance = extraData?.canCheckUserAttendance ?? false;

  // Define which columns are private vs public
  const privateColumns = [
    'email',
    'phone',
    'birthday',
    'gender',
    'ethnicity',
    'guardian',
    'national_id',
    'address',
    'note',
    'archival_note',
  ] as const;

  const publicColumns = [
    'id',
    'avatar_url',
    'full_name',
    'display_name',
    'group_count',
    'linked_users',
    'created_at',
    'updated_at',
  ] as const;

  /**
   * Security function to determine if a column should be included based on permissions.
   * Only allows columns that are explicitly categorized as private or public.
   * Actions column is shown if user has update or delete permissions.
   * Uncategorised data columns are rejected to prevent accidental exposure of sensitive data.
   */
  const shouldIncludeColumn = (columnId: string): boolean => {
    // Show actions column if user has update or delete permissions
    if (columnId === 'actions') {
      return (
        extraData?.canUpdateUsers ||
        extraData?.canDeleteUsers ||
        extraData?.canViewFeedbacks ||
        false
      );
    }

    if (privateColumns.includes(columnId as (typeof privateColumns)[number])) {
      return hasPrivateInfo;
    }

    if (publicColumns.includes(columnId as (typeof publicColumns)[number])) {
      return hasPublicInfo;
    }

    if (columnId === 'attendance_count') {
      return canCheckUserAttendance;
    }

    if ((extraFields || []).some((f) => f.id === columnId)) {
      return hasPrivateInfo;
    }

    // Reject uncategorised columns to prevent accidental data exposure
    if (process.env.NODE_ENV === 'development') {
      console.warn(
        `Column "${columnId}" is not categorised as private or public. ` +
          'Add it to privateColumns or publicColumns array to make it visible, ' +
          'or it will be hidden in production. This prevents accidental exposure of sensitive data.'
      );
    }

    return false; // Reject uncategorised columns
  };

  const allColumns: ColumnDef<WorkspaceUser>[] = [
    // {
    //   id: 'select',
    //   header: ({ table }) => (
    //     <Checkbox
    //       checked={table.getIsAllPageRowsSelected()}
    //       onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
    //       aria-label="Select all"
    //       className="translate-y-[2px]"
    //     />
    //   ),
    //   cell: ({ row }) => (
    //     <Checkbox
    //       checked={row.getIsSelected()}
    //       onCheckedChange={(value) => row.toggleSelected(!!value)}
    //       aria-label="Select row"
    //       className="translate-y-[2px]"
    //     />
    //   ),
    //   enableSorting: false,
    //   enableHiding: false,
    // },
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
        <div className="line-clamp-1 min-w-32">{row.getValue('id')}</div>
      ),
    },
    {
      accessorKey: 'avatar_url',
      header: ({ column }) => (
        <DataTableColumnHeader
          t={t}
          column={column}
          title={t(`${namespace}.avatar_url`)}
        />
      ),
      cell: ({ row }) => {
        const avatarUrl = normalizeAvatarImageSrc(
          row.getValue('avatar_url') as string | undefined
        );
        if (!avatarUrl) return <div className="min-w-32">-</div>;

        return (
          // biome-ignore lint/performance/noImgElement: Supabase public avatars are served directly to avoid Next image proxy failures.
          <img
            width={128}
            height={128}
            src={avatarUrl}
            alt="Avatar"
            className="aspect-square min-w-32 rounded-lg object-cover"
            loading="lazy"
          />
        );
      },
    },
    {
      accessorKey: 'full_name',
      header: ({ column }) => (
        <DataTableColumnHeader
          t={t}
          column={column}
          title={t(`${namespace}.full_name`)}
        />
      ),
      cell: ({ row }) => {
        const linkedUsers = Array.isArray(row.getValue('linked_users'))
          ? row.getValue<WorkspaceUser[]>('linked_users')
          : [];
        const isLinked = linkedUsers.length !== 0;
        const fullName = row.getValue<string>('full_name');
        const displayName = row.getValue<string>('display_name');
        const primaryName = fullName || displayName || '-';
        const secondaryName =
          displayName && displayName !== primaryName ? displayName : null;
        const avatarUrl = normalizeAvatarImageSrc(
          row.original.avatar_url as string | undefined
        );

        const nameNode = (
          <RequireAttentionName
            name={primaryName}
            requireAttention={!!row.original.has_require_attention_feedback}
          />
        );

        return (
          <Link
            href={row.original.href || '#'}
            className="flex min-w-48 items-center gap-3"
          >
            <UserAvatarCell avatarUrl={avatarUrl} name={primaryName} />
            <span className="flex min-w-0 flex-col">
              <span className="flex items-center gap-1.5">
                {isLinked ? (
                  <TooltipProvider>
                    <Tooltip delayDuration={0}>
                      <TooltipTrigger className="truncate font-semibold underline">
                        {nameNode}
                      </TooltipTrigger>
                      <TooltipContent className="text-center">
                        {t(`${namespace}.linked_to`)}{' '}
                        <div>
                          {linkedUsers.map((u, idx) => (
                            <Fragment key={`${u.id}-combo`}>
                              <span className="font-semibold hover:underline">
                                {u.display_name}
                              </span>
                              {idx !== linkedUsers.length - 1 && (
                                <span>, </span>
                              )}
                            </Fragment>
                          ))}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                  <span className="truncate font-semibold hover:underline">
                    {nameNode}
                  </span>
                )}
                <span
                  className={cn(
                    'shrink-0 rounded-full border px-1.5 py-0.5 font-medium text-[10px]',
                    isLinked
                      ? 'border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green'
                      : 'border-border bg-foreground/5 text-muted-foreground'
                  )}
                >
                  {isLinked
                    ? t('ws-users.linked_badge')
                    : t('ws-users.virtual_badge')}
                </span>
              </span>
              {secondaryName ? (
                <span className="truncate text-muted-foreground text-xs">
                  {secondaryName}
                </span>
              ) : null}
            </span>
          </Link>
        );
      },
    },
    {
      accessorKey: 'display_name',
      header: ({ column }) => (
        <DataTableColumnHeader
          t={t}
          column={column}
          title={t(`${namespace}.display_name`)}
        />
      ),
      cell: ({ row }) => (
        <Link href={row.original.href || '#'} className="min-w-32">
          {Array.isArray(row.getValue('linked_users')) &&
          row.getValue<WorkspaceUser[]>('linked_users').length !== 0 ? (
            <TooltipProvider>
              <Tooltip delayDuration={0}>
                <TooltipTrigger className="font-semibold underline">
                  <RequireAttentionName
                    name={
                      row.getValue('display_name') ||
                      row.getValue('full_name') ||
                      '-'
                    }
                    requireAttention={
                      !!row.original.has_require_attention_feedback
                    }
                  />
                </TooltipTrigger>
                <TooltipContent className="text-center">
                  {t(`${namespace}.linked_to`)}{' '}
                  <div>
                    {row
                      .getValue<WorkspaceUser[]>('linked_users')
                      .map((u, idx) => (
                        <>
                          <span
                            key={u.id}
                            className="font-semibold hover:underline"
                          >
                            {u.display_name}
                          </span>
                          {idx !==
                            row.getValue<WorkspaceUser[]>('linked_users')
                              .length -
                              1 && <span>, </span>}
                        </>
                      ))}
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <RequireAttentionName
              name={
                row.getValue('display_name') || row.getValue('full_name') || '-'
              }
              requireAttention={!!row.original.has_require_attention_feedback}
            />
          )}
        </Link>
      ),
    },
    {
      accessorKey: 'email',
      header: ({ column }) => (
        <DataTableColumnHeader
          t={t}
          column={column}
          title={t(`${namespace}.email`)}
        />
      ),
      cell: ({ row }) => <div>{row.getValue('email') || '-'}</div>,
    },
    {
      accessorKey: 'phone',
      header: ({ column }) => (
        <DataTableColumnHeader
          t={t}
          column={column}
          title={t(`${namespace}.phone`)}
        />
      ),
      cell: ({ row }) => (
        <div className="line-clamp-1 w-25">{row.getValue('phone') || '-'}</div>
      ),
    },
    {
      accessorKey: 'attendance_count',
      header: ({ column }) => (
        <DataTableColumnHeader
          t={t}
          column={column}
          title={t(`${namespace}.attendance_count`)}
        />
      ),
      cell: ({ row }) => (
        <div className="line-clamp-1 w-25">
          {row.getValue('attendance_count') ?? '-'}
        </div>
      ),
    },
    {
      accessorKey: 'gender',
      header: ({ column }) => (
        <DataTableColumnHeader
          t={t}
          column={column}
          title={t(`${namespace}.gender`)}
        />
      ),
      cell: ({ row }) => (
        <div className="w-32">
          {row.getValue('gender')
            ? t(row.getValue<string>('gender').toLowerCase())
            : '-'}
        </div>
      ),
    },
    {
      accessorKey: 'birthday',
      header: ({ column }) => (
        <DataTableColumnHeader
          t={t}
          column={column}
          title={t(`${namespace}.birthday`)}
        />
      ),
      cell: ({ row }) => {
        const age = moment().diff(row.getValue('birthday'), 'years');

        return (
          <div className="grid min-w-32 gap-1">
            <div>
              {row.getValue('birthday')
                ? dayjs(row.getValue('birthday'))
                    .locale(extraData?.locale)
                    .format(
                      extraData?.locale === 'vi'
                        ? 'D MMMM, YYYY'
                        : 'MMMM D, YYYY'
                    )
                : '-'}
            </div>
            {!!row.getValue('birthday') && (
              <div className="w-fit rounded border bg-foreground/5 px-2 py-0.5 font-semibold text-sm">
                {row.getValue('birthday')
                  ? `${age} ${age > 1 ? t('common.years_old') : t('common.year_old')}`
                  : '-'}
              </div>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: 'ethnicity',
      header: ({ column }) => (
        <DataTableColumnHeader
          t={t}
          column={column}
          title={t(`${namespace}.ethnicity`)}
        />
      ),
      cell: ({ row }) => (
        <div className="line-clamp-1 w-32">
          {row.getValue('ethnicity') || '-'}
        </div>
      ),
    },
    {
      accessorKey: 'guardian',
      header: ({ column }) => (
        <DataTableColumnHeader
          t={t}
          column={column}
          title={t(`${namespace}.guardian`)}
        />
      ),
      cell: ({ row }) => (
        <div className="line-clamp-1 w-32">
          {row.getValue('guardian') || '-'}
        </div>
      ),
    },
    {
      accessorKey: 'national_id',
      header: ({ column }) => (
        <DataTableColumnHeader
          t={t}
          column={column}
          title={t(`${namespace}.national_id`)}
        />
      ),
      cell: ({ row }) => (
        <div className="line-clamp-1">{row.getValue('national_id') || '-'}</div>
      ),
    },
    {
      accessorKey: 'address',
      header: ({ column }) => (
        <DataTableColumnHeader
          t={t}
          column={column}
          title={t(`${namespace}.address`)}
        />
      ),
      cell: ({ row }) => (
        <div className="line-clamp-1 w-32">
          {row.getValue('address') || '-'}
        </div>
      ),
    },
    {
      accessorKey: 'note',
      header: ({ column }) => (
        <DataTableColumnHeader
          t={t}
          column={column}
          title={t(`${namespace}.note`)}
        />
      ),
      cell: ({ row }) => (
        <div className="line-clamp-1 w-32">{row.getValue('note') || '-'}</div>
      ),
    },
    {
      accessorKey: 'archival_note',
      header: ({ column }) => (
        <DataTableColumnHeader
          t={t}
          column={column}
          title={t(`${namespace}.archival_note`)}
        />
      ),
      cell: ({ row }) => (
        <div className="line-clamp-2 w-48">
          {row.getValue('archival_note') || '-'}
        </div>
      ),
    },
    {
      accessorKey: 'group_count',
      header: ({ column }) => (
        <DataTableColumnHeader
          t={t}
          column={column}
          title={t(`${namespace}.group_count`)}
        />
      ),
      cell: ({ row }) => (
        <div className="line-clamp-1 w-32">
          {row.getValue('group_count') || '-'}
        </div>
      ),
    },
    {
      accessorKey: 'linked_users',
      header: ({ column }) => (
        <DataTableColumnHeader
          t={t}
          column={column}
          title={t(`${namespace}.linked_users`)}
        />
      ),
      cell: ({ row }) => (
        <div className="min-w-32">
          {Array.isArray(row.getValue('linked_users')) &&
          row.getValue<WorkspaceUser[]>('linked_users').length !== 0
            ? row.getValue<WorkspaceUser[]>('linked_users').map((u) => (
                <span key={u.id} className="font-semibold hover:underline">
                  {u.display_name}
                </span>
              ))
            : '-'}
        </div>
      ),
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
      cell: ({ row }) => (
        <div className="min-w-32">
          {moment(row.getValue('created_at')).format('DD/MM/YYYY')}
        </div>
      ),
    },
    {
      accessorKey: 'updated_at',
      header: ({ column }) => (
        <DataTableColumnHeader
          t={t}
          column={column}
          title={t(`${namespace}.updated_at`)}
        />
      ),
      cell: ({ row }) => (
        <div className="min-w-32">
          {moment(row.getValue('updated_at')).format('DD/MM/YYYY')}
        </div>
      ),
    },
    // {
    //   accessorKey: 'status',
    //   header: ({ column }) => (
    //     <DataTableColumnHeader t={t}column={column} title="Status" />
    //   ),
    //   cell: ({ row }) => {
    //     const status = statuses.find(
    //       (status) => status.value === row.getValue('status')
    //     );

    //     if (!status) {
    //       return null;
    //     }

    //     return (
    //       <div className="flex w-25 items-center">
    //         {status.icon && (
    //           <status.icon className="text-muted-foreground mr-2 h-4 w-4" />
    //         )}
    //         <span>{status.label}</span>
    //       </div>
    //     );
    //   },
    //   filterFn: (row, id, value) => {
    //     return value.includes(row.getValue(id));
    //   },
    // },
    // {
    //   accessorKey: 'priority',
    //   header: ({ column }) => (
    //     <DataTableColumnHeader t={t}column={column} title="Priority" />
    //   ),
    //   cell: ({ row }) => {
    //     const priority = priorities.find(
    //       (priority) => priority.value === row.getValue('priority')
    //     );

    //     if (!priority) {
    //       return null;
    //     }

    //     return (
    //       <div className="flex items-center">
    //         {priority.icon && (
    //           <priority.icon className="text-muted-foreground mr-2 h-4 w-4" />
    //         )}
    //         <span>{priority.label}</span>
    //       </div>
    //     );
    //   },
    //   filterFn: (row, id, value) => {
    //     return value.includes(row.getValue(id));
    //   },
    // },
    ...((extraFields?.map((field) => ({
      id: field.id,
      accessorKey: field.id,
      header: ({ column }) => (
        <DataTableColumnHeader t={t} column={column} title={field.name} />
      ),

      cell: ({ row: _ }) => (
        <div className="line-clamp-1 w-32">
          {/* {row.getValue(field.id) || '-'} */}-
        </div>
      ),
    })) || []) as ColumnDef<WorkspaceUser>[]),
    {
      id: 'actions',
      cell: ({ row }) => (
        <UserRowActions
          row={row}
          href={row.original.href}
          extraData={extraData}
        />
      ),
    },
  ];

  // Filter columns based on permissions
  // SECURITY: Only columns with explicit categorization (private/public) are allowed.
  // Uncategorised columns are rejected to prevent accidental exposure of sensitive data.
  return allColumns.filter((column) => {
    const columnId =
      (column as { id?: string; accessorKey?: string }).id ||
      (column as { id?: string; accessorKey?: string }).accessorKey;

    if (!columnId) return true; // Keep columns without explicit identifiers (like actions)
    return shouldIncludeColumn(columnId);
  });
};
