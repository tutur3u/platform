'use client';

import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { WorkspaceDataset } from '@tuturuuu/types/db';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { Plus, RotateCw, Trash, Upload } from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@tuturuuu/ui/pagination';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { DatasetCrawler } from './dataset-crawler';

interface Props {
  wsId: string;
  dataset: WorkspaceDataset;
}

export function DataExplorer({ wsId, dataset }: Props) {
  const t = useTranslations('ws-datasets');
  const queryClient = useQueryClient();
  const columnNameId = useId();
  const columnTypeId = useId();

  const [pageSize, setPageSize] = useState('10');
  const [currentPage, setCurrentPage] = useState(1);
  const [isAddingRow, setIsAddingRow] = useState(false);
  const [newRow, setNewRow] = useState<Record<string, string | number | null>>(
    {}
  );
  const [editingRow, setEditingRow] = useState<{
    row_id: string;
    cells: Record<string, string | number | null>;
  } | null>(null);
  const [isClearingRows, setIsClearingRows] = useState(false);

  // Query for columns
  const columnsQuery = useQuery({
    queryKey: [wsId, dataset.id, 'columns'],
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/datasets/${dataset.id}/columns`
      );
      if (!response.ok) throw new Error('Failed to fetch columns');
      return response.json();
    },
    placeholderData: keepPreviousData,
  });

  // Query for rows with pagination using the new view
  const rowsQuery = useQuery({
    queryKey: [wsId, dataset.id, 'rows', { currentPage, pageSize }],
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/datasets/${dataset.id}/rows?` +
          new URLSearchParams({
            page: currentPage.toString(),
            pageSize,
            useView: 'true', // Add this flag to use the view
          })
      );
      if (!response.ok) throw new Error('Failed to fetch rows');
      return response.json();
    },
    placeholderData: keepPreviousData,
  });

  const headers =
    columnsQuery.data?.map((col: { name: string }) => col.name) || [];
  const { data, totalRows = 0 } = rowsQuery.data || {};
  const totalPages = Math.ceil(totalRows / parseInt(pageSize));

  const handlePageSizeChange = (value: string) => {
    setPageSize(value);
    setCurrentPage(1);
  };

  const handleRefresh = () => {
    columnsQuery.refetch();
    rowsQuery.refetch();
  };

  const handleAddRow = async () => {
    try {
      // Optimistic update
      queryClient.setQueryData(
        [wsId, dataset.id, 'rows', { currentPage, pageSize }],
        (old: any) => ({
          ...old,
          data: [...(old?.data || []), { cells: newRow, id: 'temp' }],
        })
      );

      const response = await fetch(
        `/api/v1/workspaces/${wsId}/datasets/${dataset.id}/rows`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rows: [newRow] }),
        }
      );

      if (!response.ok) throw new Error('Failed to add row');

      setIsAddingRow(false);
      setNewRow({});
      queryClient.invalidateQueries({
        queryKey: [wsId, dataset.id, 'rows', { currentPage, pageSize }],
      });
    } catch (error) {
      console.error('Error adding row:', error);
      // Revert optimistic update
      queryClient.invalidateQueries({
        queryKey: [wsId, dataset.id, 'rows', { currentPage, pageSize }],
      });
      // Show error to user (implement your error UI)
    }
  };

  // Similar updates for handleEditRow and handleDeleteRow
  const handleEditRow = async () => {
    if (!editingRow) return;

    try {
      const updates = Object.keys(editingRow.cells).map((header) => ({
        rowId: editingRow.row_id,
        columnId:
          columnsQuery.data.find(
            (col: { name: string; id: string }) => col.name === header
          )?.id || '',
        data: editingRow.cells[header],
      }));

      await Promise.all(
        updates.map((update) =>
          fetch(`/api/v1/workspaces/${wsId}/datasets/${dataset.id}/cells`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(update),
          })
        )
      );

      setEditingRow(null);
      queryClient.invalidateQueries({
        queryKey: [wsId, dataset.id, 'rows', { currentPage, pageSize }],
      });
    } catch (error) {
      console.error('Error editing row:', error);
    }
  };

  const handleDeleteRow = async (rowId: string) => {
    try {
      // Optimistic delete
      queryClient.setQueryData(
        [wsId, dataset.id, 'rows', { currentPage, pageSize }],
        (old: any) => ({
          ...old,
          data: old?.data?.filter((row: any) => row.id !== rowId) || [],
        })
      );

      const response = await fetch(
        `/api/v1/workspaces/${wsId}/datasets/${dataset.id}/rows`,
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rowId }),
        }
      );

      if (!response.ok) throw new Error('Failed to delete row');

      queryClient.invalidateQueries({
        queryKey: [wsId, dataset.id, 'rows', { currentPage, pageSize }],
      });
    } catch (error) {
      console.error('Error deleting row:', error);
      // Revert optimistic delete
      queryClient.invalidateQueries({
        queryKey: [wsId, dataset.id, 'rows', { currentPage, pageSize }],
      });
      // Show error to user (implement your error UI)
    }
  };

  const handleClearAllRows = async () => {
    setIsClearingRows(true);
    try {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/datasets/${dataset.id}/rows/clear`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }
      );

      if (response.ok) {
        queryClient.invalidateQueries({
          queryKey: [wsId, dataset.id, 'rows', { currentPage, pageSize }],
        });
      }
    } catch (error) {
      console.error('Error clearing all rows:', error);
    } finally {
      setIsClearingRows(false);
    }
  };

  const TableContent = () => {
    if (!headers.length) {
      return (
        <div className="flex h-64 flex-col items-center justify-center">
          <p className="text-sm text-muted-foreground">{t('no_data')}</p>
          <Button variant="outline" onClick={handleRefresh} className="mt-4">
            {t('common.refresh')}
          </Button>
        </div>
      );
    }

    return (
      <div className="rounded-lg border">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                {headers.map((header: any, index: number) => (
                  <th key={index} className="p-2 text-left text-sm">
                    <div className="line-clamp-1">{header}</div>
                  </th>
                ))}
                <th className="p-2 text-left text-sm">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {rowsQuery.isPlaceholderData && data.length > 0
                ? // Show skeleton rows while loading with existing data
                  Array.from({ length: parseInt(pageSize) }).map(
                    (_, rowIndex) => (
                      <tr key={`skeleton-${rowIndex}`} className="border-b">
                        {headers.map((_: any, colIndex: number) => (
                          <td key={colIndex} className="p-2">
                            <Skeleton className="h-9 w-full" />
                          </td>
                        ))}
                        <td className="flex gap-2 p-2">
                          <Skeleton className="h-9 w-full" />
                          <Skeleton className="h-9 w-full" />
                        </td>
                      </tr>
                    )
                  )
                : data.map((row: any, rowIndex: number) => (
                    <tr key={rowIndex} className="border-b">
                      {headers.map((header: any, colIndex: number) => (
                        <td
                          key={colIndex}
                          className="min-w-32 p-2 text-sm whitespace-pre-line"
                        >
                          <span className="line-clamp-3">
                            {row.cells[header]}
                          </span>
                        </td>
                      ))}
                      <td className="flex gap-2 p-2 text-sm">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setEditingRow({ ...row, cells: { ...row.cells } })
                          }
                        >
                          {t('common.edit')}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteRow(row.id)}
                        >
                          {t('common.delete')}
                        </Button>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const getPageHref = (page: number) => {
    return `#page=${page}`;
  };

  const handlePageClick = (page: number) => {
    setCurrentPage(page);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {t('common.rows-per-page')}:
          </span>
          <Select value={pageSize} onValueChange={handlePageSizeChange}>
            <SelectTrigger className="w-[100px]">
              <SelectValue placeholder="10" />
            </SelectTrigger>
            <SelectContent>
              {[10, 20, 50, 100].map((size) => (
                <SelectItem key={size} value={size.toString()}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleRefresh}>
            <RotateCw className="h-4 w-4" />
            {t('common.refresh')}
          </Button>
          <Button
            variant="outline"
            onClick={handleClearAllRows}
            disabled={isClearingRows}
          >
            {isClearingRows ? (
              <>{t('common.clearing')}...</>
            ) : (
              <>
                <Trash className="h-4 w-4" />
                {t('common.clear_all')}
              </>
            )}
          </Button>
          <Dialog open={isAddingRow} onOpenChange={setIsAddingRow}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Plus className="h-4 w-4" />
                {t('add_row')}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('add_row')}</DialogTitle>
              </DialogHeader>
              <ScrollArea className="max-h-96 space-y-4">
                {headers.map((header: any) => (
                  <div key={header} className="space-y-2">
                    <label
                      className="text-sm font-medium"
                      htmlFor={`${columnNameId}-${header}`}
                    >
                      {header}
                    </label>
                    <Input
                      value={newRow[header] || ''}
                      onChange={(e) =>
                        setNewRow({ ...newRow, [header]: e.target.value })
                      }
                      placeholder={`Enter ${header}`}
                      id={`${columnNameId}-${header}`}
                    />
                  </div>
                ))}
              </ScrollArea>
              <Button onClick={handleAddRow} className="w-full">
                {t('common.add')}
              </Button>
            </DialogContent>
          </Dialog>
          <DatasetCrawler wsId={wsId} dataset={dataset}>
            <Button variant="outline">
              <Upload className="mr-2 h-4 w-4" />
              Import Data
            </Button>
          </DatasetCrawler>
        </div>
      </div>

      {rowsQuery.isFetching && !data?.length ? (
        <div className="flex h-64 items-center justify-center">
          <span className="text-sm text-muted-foreground">
            {t('common.loading')}...
          </span>
        </div>
      ) : (
        <TableContent />
      )}

      {/* Show skeleton pagination when loading but not on first load */}
      {data?.length > 0 && (
        <div className="flex items-center justify-between">
          {rowsQuery.isPending ? (
            <>
              <Skeleton className="h-4 w-64" /> {/* Row count text */}
              <Skeleton className="h-9 w-80" /> {/* Pagination */}
            </>
          ) : (
            <>
              <div className="text-sm text-muted-foreground">
                Showing {(currentPage - 1) * parseInt(pageSize) + 1} to{' '}
                {Math.min(currentPage * parseInt(pageSize), totalRows)} of{' '}
                {totalRows} rows
              </div>

              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      href={getPageHref(currentPage - 1)}
                      onClick={() => handlePageClick(currentPage - 1)}
                      className={
                        currentPage <= 1
                          ? 'pointer-events-none opacity-50'
                          : 'cursor-pointer'
                      }
                    />
                  </PaginationItem>

                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(
                      (page) =>
                        page === 1 ||
                        page === totalPages ||
                        (page >= currentPage - 1 && page <= currentPage + 1)
                    )
                    .map((page, index, array) => {
                      if (index > 0 && array[index - 1] !== page - 1) {
                        return (
                          <PaginationItem key={`ellipsis-${page}`}>
                            <PaginationEllipsis />
                          </PaginationItem>
                        );
                      }

                      return (
                        <PaginationItem key={page}>
                          <PaginationLink
                            onClick={() => handlePageClick(page)}
                            isActive={page === currentPage}
                            className="cursor-pointer"
                          >
                            {page}
                          </PaginationLink>
                        </PaginationItem>
                      );
                    })}

                  {currentPage < totalPages - 1 && (
                    <PaginationItem key={totalPages}>
                      <PaginationLink
                        onClick={() => handlePageClick(totalPages)}
                        isActive={currentPage === totalPages}
                        className="cursor-pointer"
                      >
                        {totalPages}
                      </PaginationLink>
                    </PaginationItem>
                  )}

                  <PaginationItem>
                    <PaginationNext
                      href={getPageHref(currentPage + 1)}
                      onClick={() => handlePageClick(currentPage + 1)}
                      className={
                        currentPage >= totalPages
                          ? 'pointer-events-none opacity-50'
                          : 'cursor-pointer'
                      }
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </>
          )}
        </div>
      )}

      {editingRow && (
        <Dialog open={!!editingRow} onOpenChange={() => setEditingRow(null)}>
          <DialogTrigger asChild>
            <Button variant="outline">{t('edit_row')}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('edit_row')}</DialogTitle>
            </DialogHeader>
            <ScrollArea className="max-h-96 space-y-4">
              {headers.map((header: any) => (
                <div key={header} className="space-y-2">
                  <label
                    className="text-sm font-medium"
                    htmlFor={`${columnTypeId}-${header}`}
                  >
                    {header}
                  </label>
                  <Input
                    value={editingRow.cells[header] || ''}
                    onChange={(e) =>
                      setEditingRow({
                        ...editingRow,
                        cells: {
                          ...editingRow.cells,
                          [header]: e.target.value,
                        },
                      })
                    }
                    placeholder={`Enter ${header}`}
                    id={`${columnTypeId}-${header}`}
                  />
                </div>
              ))}
            </ScrollArea>
            <Button onClick={handleEditRow} className="w-full">
              {t('common.save')}
            </Button>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
