'use client';

import type { Table } from '@tanstack/react-table';
import { Download, RotateCcw, Upload } from '@tuturuuu/icons';
import { Dialog, DialogContent, DialogTrigger } from '@tuturuuu/ui/dialog';
import type { ReactNode } from 'react';
import { Button } from '../../button';
import SearchBar from '../search-bar';
import { DataTableCreateButton } from './data-table-create-button';
import { DataTableRefreshButton } from './data-table-refresh-button';
import { DataTableViewOptions } from './data-table-view-options';

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
  isFiltered?: boolean;
  t?: any;
  importContent?: ReactNode;
  exportContent?: ReactNode;
  /** Custom toolbar actions rendered directly (not wrapped in dialogs) */
  toolbarActions?: ReactNode;
  onRefresh: () => void;
  selectedRowsActions?: (selectedRows: TData[]) => ReactNode;

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
  isFiltered: isFilteredProp,
  t,
  namespace,
  importContent,
  exportContent,
  toolbarActions,
  onRefresh,
  selectedRowsActions,
  onSearch,
  resetParams,
}: DataTableToolbarProps<TData>) {
  const isFiltered =
    isFilteredProp !== undefined
      ? isFilteredProp
      : table.getState().columnFilters.length > 0 ||
        (defaultQuery?.length || 0) > 0;

  return (
    <div className="flex flex-col items-start justify-between gap-2 md:flex-row">
      <div className="grid w-full flex-1 flex-wrap items-center gap-2 md:flex">
        {disableSearch || (
          <SearchBar
            t={t}
            defaultValue={defaultQuery}
            onSearch={onSearch}
            className="col-span-full w-full bg-background md:col-span-1 md:max-w-xs"
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
        {table.getSelectedRowModel().rows.length > 0 && selectedRowsActions && (
          <div className="flex items-center gap-2">
            {selectedRowsActions(
              table.getSelectedRowModel().rows.map((r) => r.original)
            )}
          </div>
        )}
      </div>

      {toolbarActions}

      {importContent && (
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 w-full md:w-fit">
              <Download className="h-4 w-4" />
              {t?.('common.import')}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl">{importContent}</DialogContent>
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
              <Upload className="h-4 w-4" />
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
