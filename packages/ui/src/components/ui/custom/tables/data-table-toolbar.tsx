'use client';

import { Button } from '../../button';
import SearchBar from '../search-bar';
import { DataTableCreateButton } from './data-table-create-button';
import { DataTableRefreshButton } from './data-table-refresh-button';
import { DataTableViewOptions } from './data-table-view-options';
import { Table } from '@tanstack/react-table';
import { X } from 'lucide-react';
import { ReactNode } from 'react';

interface DataTableToolbarProps<TData> {
  hasData: boolean;
  newObjectTitle?: string;
  editContent?: ReactNode;
  namespace: string;
  table: Table<TData>;
  filters?: ReactNode[] | ReactNode;
  extraColumns?: any[];
  defaultQuery?: string;
  disableSearch?: boolean;
  isEmpty: boolean;
  t?: any;
  onRefresh: () => void;
  // eslint-disable-next-line no-unused-vars
  onSearch: (query: string) => void;
  resetParams: () => void;
}

export function DataTableToolbar<TData>({
  hasData,
  newObjectTitle,
  editContent,
  table,
  filters,
  extraColumns,
  defaultQuery,
  disableSearch = false,
  isEmpty,
  t,
  namespace,
  onRefresh,
  onSearch,
  resetParams,
}: DataTableToolbarProps<TData>) {
  const isFiltered =
    table.getState().columnFilters.length > 0 ||
    !isEmpty ||
    (defaultQuery?.length || 0) > 0;

  return (
    <div className="flex flex-col items-center justify-between gap-2 md:flex-row">
      <div className="grid w-full flex-1 flex-wrap items-center gap-2 md:flex">
        {disableSearch || (
          <SearchBar
            t={t}
            defaultValue={defaultQuery}
            onSearch={onSearch}
            className="col-span-full w-full md:col-span-1 md:max-w-xs"
          />
        )}
        {filters}
        {isFiltered && (
          <Button
            variant="secondary"
            onClick={() => {
              table.resetColumnFilters();
              resetParams();
            }}
            className="h-8 px-2 lg:px-3"
          >
            {t?.('common.reset')}
            <X className="ml-2 h-4 w-4" />
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
        {hasData && (
          <DataTableRefreshButton
            onRefresh={onRefresh}
            refreshText={t?.('common.refresh') || 'Refresh'}
          />
        )}
        <DataTableViewOptions
          t={t}
          namespace={namespace}
          table={table}
          extraColumns={extraColumns}
        />
      </div>
    </div>
  );
}
