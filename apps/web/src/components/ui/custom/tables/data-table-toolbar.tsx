'use client';

import { Cross2Icon } from '@radix-ui/react-icons';
import { Table } from '@tanstack/react-table';

import { Button } from '@/components/ui/button';
import { DataTableViewOptions } from './data-table-view-options';
import GeneralSearchBar from '@/components/inputs/GeneralSearchBar';
import { DataTableRefreshButton } from './data-table-refresh-button';
import { DataTableCreateButton } from './data-table-create-button';
import { ReactNode } from 'react';
import useQuery from '@/hooks/useQuery';
import useTranslation from 'next-translate/useTranslation';

interface DataTableToolbarProps<TData> {
  newObjectTitle?: string;
  editContent?: ReactNode;
  namespace: string;
  table: Table<TData>;
  filters?: ReactNode[];
  extraColumns?: any[];
}

export function DataTableToolbar<TData>({
  newObjectTitle,
  editContent,
  namespace,
  table,
  filters,
  extraColumns,
}: DataTableToolbarProps<TData>) {
  const { t } = useTranslation(namespace);
  const query = useQuery();

  const isFiltered =
    table.getState().columnFilters.length > 0 || !query.isEmpty;

  return (
    <div className="flex flex-col items-center justify-between gap-2 md:flex-row">
      <div className="flex w-full flex-1 items-center gap-2">
        <GeneralSearchBar className="w-full md:max-w-xs" />
        {filters}
        {isFiltered && (
          <Button
            variant="outline"
            onClick={() => {
              table.resetColumnFilters();
              query.reset();
            }}
            className="h-8 px-2 lg:px-3"
          >
            {t('common:reset')}
            <Cross2Icon className="ml-2 h-4 w-4" />
          </Button>
        )}
      </div>
      <div className="grid w-full grid-cols-2 gap-2 md:flex md:w-fit">
        {editContent && (
          <DataTableCreateButton
            newObjectTitle={newObjectTitle}
            editContent={editContent}
          />
        )}
        <DataTableRefreshButton />
        <DataTableViewOptions
          namespace={namespace}
          table={table}
          extraColumns={extraColumns}
        />
      </div>
    </div>
  );
}
