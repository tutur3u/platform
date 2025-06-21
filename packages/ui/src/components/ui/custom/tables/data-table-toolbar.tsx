'use client';

import { Button } from '../../button';
import SearchBar from '../search-bar';
import { DataTableCreateButton } from './data-table-create-button';
import { DataTableRefreshButton } from './data-table-refresh-button';
import { DataTableViewOptions } from './data-table-view-options';
import { Dialog, DialogContent, DialogTrigger } from '@ncthub/ui/dialog';
import { Table } from '@tanstack/react-table';
import { Download, RotateCcw, Upload } from 'lucide-react';
import { ReactNode } from 'react';

interface DataTableToolbarProps<TData> {
  hasData: boolean;
  newObjectTitle?: string;
  editContent?: ReactNode;
  namespace: string | undefined;
  table: Table<TData>;
  filters?: ReactNode[] | ReactNode;
  extraColumns?: any[];
  defaultQuery?: string;
  disableSearch?: boolean;
  isEmpty: boolean;
  t?: any;
  importContent?: ReactNode;
  exportContent?: ReactNode;
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
  importContent,
  exportContent,
  onRefresh,
  onSearch,
  resetParams,
}: DataTableToolbarProps<TData>) {
  const isFiltered =
    table.getState().columnFilters.length > 0 ||
    !isEmpty ||
    (defaultQuery?.length || 0) > 0;

  return (
    <div className="flex flex-col items-start justify-between gap-2 md:flex-row">
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
            <RotateCcw className="h-4 w-4" />
          </Button>
        )}
      </div>

      {importContent && (
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 w-full md:w-fit">
              <Upload className="h-4 w-4" />
              {t?.('common.import')}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">{importContent}</DialogContent>
        </Dialog>
      )}

      {exportContent && (
        <Dialog>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="ml-auto h-8 w-full md:w-fit"
            >
              <Download className="h-4 w-4" />
              {t?.('common.export')}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">{exportContent}</DialogContent>
        </Dialog>
      )}

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
