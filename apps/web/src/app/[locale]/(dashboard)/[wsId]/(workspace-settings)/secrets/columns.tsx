'use client';

import { SecretRowActions } from './row-actions';
import {
  useIsFetching,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import { WorkspaceSecret } from '@tuturuuu/types/primitives/WorkspaceSecret';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import { Loader2 } from '@tuturuuu/ui/icons';
import { Switch } from '@tuturuuu/ui/switch';
import moment from 'moment';
import { useParams, useRouter } from 'next/navigation';

export const secretColumns = (
  t: any,
  namespace: string | undefined
): ColumnDef<WorkspaceSecret>[] => {
  const params = useParams();
  const router = useRouter();
  const wsId = params.wsId as string;
  const queryClient = useQueryClient();
  const isFetching = useIsFetching({ queryKey: ['secrets'] });

  const toggleMutation = useMutation({
    mutationFn: async ({
      id,
      value,
      name,
    }: {
      id: string;
      value: boolean;
      name: string;
    }) => {
      const res = await fetch(`/api/workspaces/${wsId}/secrets/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          id,
          name,
          value: value.toString(),
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to update secret value');
      }

      return res.json();
    },
    onMutate: async ({ id, value, name }) => {
      await queryClient.cancelQueries({ queryKey: ['secrets'] });

      const previousData = queryClient.getQueryData<WorkspaceSecret[]>([
        'secrets',
      ]);

      queryClient.setQueryData<WorkspaceSecret[]>(['secrets'], (old) => {
        if (!old) return [];
        return old.map((item) =>
          item.id === id ? { ...item, name, value: value.toString() } : item
        );
      });

      return { previousData };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['secrets'], context.previousData);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['secrets'] });
      router.refresh();
    },
  });

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
      accessorKey: 'id',
      header: ({ column }) => (
        <DataTableColumnHeader
          t={t}
          column={column}
          title={t(`${namespace}.id`)}
        />
      ),
      cell: ({ row }) => (
        <div className="line-clamp-1 max-w-[8rem] break-all">
          {row.getValue('id')}
        </div>
      ),
    },
    {
      accessorKey: 'name',
      header: ({ column }) => (
        <DataTableColumnHeader
          t={t}
          column={column}
          title={t(`${namespace}.name`)}
        />
      ),
      cell: ({ row }) => (
        <div className="line-clamp-1 font-semibold break-all">
          {row.getValue('name') || '-'}
        </div>
      ),
    },
    {
      accessorKey: 'value',
      header: ({ column }) => (
        <DataTableColumnHeader
          t={t}
          column={column}
          title={t(`${namespace}.value`)}
        />
      ),
      cell: ({ row }) => {
        const value = row.getValue('value') as string;
        const id = row.getValue('id') as string;
        const name = row.getValue('name') as string;

        // Check if the value is a boolean string
        const isBool = value === 'true' || value === 'false';
        if (!isBool) {
          return (
            <div className="line-clamp-1 max-w-[8rem] break-all">
              {value || '-'}
            </div>
          );
        }

        const isLoading =
          (toggleMutation.isPending && toggleMutation.variables?.id === id) ||
          (isFetching > 0 && toggleMutation.variables?.id === id);

        return (
          <div className="flex items-center gap-2">
            <Switch
              checked={value === 'true'}
              onCheckedChange={(checked) =>
                toggleMutation.mutate({ id, name, value: checked })
              }
              disabled={isLoading}
            />
            {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
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
      cell: ({ row }) => (
        <div className="line-clamp-2 max-w-[8rem] break-all">
          {row.getValue('created_at')
            ? moment(row.getValue('created_at')).format('DD/MM/YYYY, HH:mm:ss')
            : '-'}
        </div>
      ),
    },
    {
      id: 'actions',
      header: ({ column }) => <DataTableColumnHeader t={t} column={column} />,
      cell: ({ row }) => <SecretRowActions row={row} />,
    },
  ];
};
