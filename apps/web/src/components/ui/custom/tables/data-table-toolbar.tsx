'use client';

import { Cross2Icon } from '@radix-ui/react-icons';
import { Table } from '@tanstack/react-table';

import { Button } from '@/components/ui/button';
import { DataTableViewOptions } from './data-table-view-options';
import GeneralSearchBar from '@/components/inputs/GeneralSearchBar';
import { DataTableRefreshButton } from './data-table-refresh-button';
import { DataTableCreateButton } from './data-table-create-button';
import { ReactNode } from 'react';

interface DataTableToolbarProps<TData> {
  editContent?: ReactNode;
  namespace: string;
  table: Table<TData>;
}

export function DataTableToolbar<TData>({
  editContent,
  namespace,
  table,
}: DataTableToolbarProps<TData>) {
  const isFiltered = table.getState().columnFilters.length > 0;

  return (
    <div className="flex flex-col items-center justify-between gap-2 md:flex-row">
      <div className="flex w-full flex-1 items-center gap-2 space-x-2">
        <GeneralSearchBar className="w-full md:max-w-xs" />
        {/* {table.getColumn('status') && (
          <DataTableFacetedFilter
            column={table.getColumn('status')}
            title="Status"
            options={statuses}
          />
        )}
        {table.getColumn('priority') && (
          <DataTableFacetedFilter
            column={table.getColumn('priority')}
            title="Priority"
            options={priorities}
          />
        )} */}
        {isFiltered && (
          <Button
            variant="ghost"
            onClick={() => table.resetColumnFilters()}
            className="h-8 px-2 lg:px-3"
          >
            Reset
            <Cross2Icon className="ml-2 h-4 w-4" />
          </Button>
        )}
      </div>
      <div className="grid w-full grid-cols-2 gap-2 md:flex md:w-fit">
        {editContent && <DataTableCreateButton editContent={editContent} />}
        <DataTableRefreshButton />
        <DataTableViewOptions namespace={namespace} table={table} />
      </div>
    </div>
  );
}
