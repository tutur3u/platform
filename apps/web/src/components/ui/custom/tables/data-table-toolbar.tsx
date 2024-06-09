'use client';

import { DataTableCreateButton } from './data-table-create-button';
import { DataTableRefreshButton } from './data-table-refresh-button';
import { DataTableViewOptions } from './data-table-view-options';
import GeneralSearchBar from '@/components/inputs/GeneralSearchBar';
import { Button } from '@/components/ui/button';
import useSearchParams from '@/hooks/useSearchParams';
import { Cross2Icon } from '@radix-ui/react-icons';
import { Table } from '@tanstack/react-table';
import useTranslation from 'next-translate/useTranslation';
import { ReactNode } from 'react';

interface DataTableToolbarProps<TData> {
  newObjectTitle?: string;
  editContent?: ReactNode;
  namespace: string;
  table: Table<TData>;
  filters?: ReactNode[];
  extraColumns?: any[];
  disableSearch?: boolean;
}

export function DataTableToolbar<TData>({
  newObjectTitle,
  editContent,
  namespace,
  table,
  filters,
  extraColumns,
  disableSearch = false,
}: DataTableToolbarProps<TData>) {
  const { t } = useTranslation(namespace);
  const searchParams = useSearchParams();

  const isFiltered =
    table.getState().columnFilters.length > 0 || !searchParams.isEmpty;

  return (
    <div className="flex flex-col items-center justify-between gap-2 md:flex-row">
      <div className="grid w-full flex-1 flex-wrap items-center gap-2 md:flex">
        {disableSearch || (
          <GeneralSearchBar className="col-span-full w-full md:col-span-1 md:max-w-xs" />
        )}
        {filters}
        {isFiltered && (
          <Button
            variant="secondary"
            onClick={() => {
              table.resetColumnFilters();
              searchParams.reset();
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
