'use client';

import { AIWhitelistEmailRowActions } from './row-actions';
import { AIWhitelistEmail } from '@/types/db';
import { DataTableColumnHeader } from '@repo/ui/components/ui/custom/tables/data-table-column-header';
import { Switch } from '@repo/ui/components/ui/switch';
import { ColumnDef } from '@tanstack/react-table';
import moment from 'moment';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export const getAIWhitelistEmailColumns = (
  t: any
): ColumnDef<AIWhitelistEmail>[] => {
  const router = useRouter();

  const [pendingEmails, setPendingEmails] = useState<string[]>([]);

  const toggleWhitelist = async (email: string, enabled: boolean) => {
    setPendingEmails((prev) => [...prev, email]);

    const res = await fetch(`/api/v1/infrastructure/ai/whitelist/${email}`, {
      method: 'PUT',
      body: JSON.stringify({ email, enabled }),
    });

    if (res.ok) {
      router.refresh();
    } else {
      setPendingEmails((prev) => prev.filter((e) => e !== email));
    }
  };

  return [
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
      accessorKey: 'email',
      header: ({ column }) => (
        <DataTableColumnHeader t={t} column={column} title="Email" />
      ),
      cell: ({ row }) => (
        <div className="line-clamp-1">{row.getValue('email')}</div>
      ),
    },
    {
      accessorKey: 'enabled',
      header: ({ column }) => (
        <DataTableColumnHeader
          t={t}
          column={column}
          title={t(`common.enabled`)}
        />
      ),
      cell: ({ row }) => (
        <Switch
          id="enabled"
          checked={row.getValue('enabled')}
          onCheckedChange={(checked) => {
            const email = row.getValue('email');
            toggleWhitelist(email as string, checked);
          }}
          disabled={
            pendingEmails.includes(row.getValue('email') || '-') &&
            pendingEmails.some(
              (e) =>
                e !== row.getValue('enabled') && e !== row.getValue('email')
            )
          }
        />
      ),
    },
    {
      accessorKey: 'created_at',
      header: ({ column }) => (
        <DataTableColumnHeader
          t={t}
          column={column}
          title={t(`ws-users.created_at`)}
        />
      ),
      cell: ({ row }) => (
        <div>
          {row.getValue('created_at')
            ? moment(row.getValue('created_at')).format('DD/MM/YYYY, HH:mm:ss')
            : '-'}
        </div>
      ),
    },
    {
      id: 'actions',
      cell: ({ row }) => <AIWhitelistEmailRowActions row={row} />,
    },
  ];
};
