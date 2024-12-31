'use client';

import { Button } from '@repo/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@repo/ui/components/ui/dialog';
import { Input } from '@repo/ui/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/ui/components/ui/select';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

interface Props {
  wsId: string;
  datasetId: string;
}

export function DataExplorer({ wsId, datasetId }: Props) {
  const t = useTranslations();
  const [pageSize, setPageSize] = useState('10');
  const [currentPage, setCurrentPage] = useState(1);
  const [data, setData] = useState<any[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isAddingRow, setIsAddingRow] = useState(false);
  const [newRow, setNewRow] = useState<any>({});
  const [editingRow, setEditingRow] = useState<any>(null);

  const fetchColumns = async () => {
    const response = await fetch(
      `/api/v1/workspaces/${wsId}/datasets/${datasetId}/columns`
    );
    if (response.ok) {
      const columns = await response.json();
      setHeaders(columns.map((col: any) => col.name));
    }
  };

  const fetchData = async () => {
    setLoading(true);
    const response = await fetch(
      `/api/v1/workspaces/${wsId}/datasets/${datasetId}/rows?` +
        new URLSearchParams({
          page: currentPage.toString(),
          pageSize,
        })
    );

    if (response.ok) {
      const { data: rowData, totalRows: total } = await response.json();
      setData(rowData);
      setTotalRows(total);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchColumns();
  }, [datasetId]);

  useEffect(() => {
    fetchData();
  }, [currentPage, pageSize, datasetId]);

  const handlePageSizeChange = (value: string) => {
    setPageSize(value);
    setCurrentPage(1);
  };

  const handleRefresh = () => {
    fetchData();
  };

  const handleAddRow = async () => {
    const response = await fetch(
      `/api/v1/workspaces/${wsId}/datasets/${datasetId}/rows`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: [newRow] }),
      }
    );

    if (response.ok) {
      setIsAddingRow(false);
      setNewRow({});
      fetchData();
    }
  };

  const handleEditRow = async () => {
    const response = await fetch(
      `/api/v1/workspaces/${wsId}/datasets/${datasetId}/rows`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rowId: editingRow.id, row: editingRow }),
      }
    );

    if (response.ok) {
      setEditingRow(null);
      fetchData();
    }
  };

  const handleDeleteRow = async (rowId: string) => {
    const response = await fetch(
      `/api/v1/workspaces/${wsId}/datasets/${datasetId}/rows`,
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rowId }),
      }
    );

    if (response.ok) {
      fetchData();
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-sm">
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
            {t('common.refresh')}
          </Button>
          <Dialog open={isAddingRow} onOpenChange={setIsAddingRow}>
            <DialogTrigger asChild>
              <Button variant="outline">{t('ws-datasets.add_row')}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('ws-datasets.add_row')}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {headers.map((header) => (
                  <div key={header} className="space-y-2">
                    <label className="text-sm font-medium">{header}</label>
                    <Input
                      value={newRow[header] || ''}
                      onChange={(e) =>
                        setNewRow({ ...newRow, [header]: e.target.value })
                      }
                      placeholder={`Enter ${header}`}
                    />
                  </div>
                ))}
                <Button onClick={handleAddRow} className="w-full">
                  {t('common.add')}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <span className="text-muted-foreground text-sm">
            {t('common.loading')}
          </span>
        </div>
      ) : data.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center">
          <p className="text-muted-foreground text-sm">
            {t('ws-datasets.no_data')}
          </p>
          <Button variant="outline" onClick={handleRefresh} className="mt-4">
            {t('common.refresh')}
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-muted/50 border-b">
                  {headers.map((header, index) => (
                    <th key={index} className="p-2 text-left text-sm">
                      {header}
                    </th>
                  ))}
                  <th className="p-2 text-left text-sm">
                    {t('common.actions')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.map((row, rowIndex) => (
                  <tr key={rowIndex} className="border-b">
                    {headers.map((header, colIndex) => (
                      <td key={colIndex} className="p-2 text-sm">
                        {row[header]}
                      </td>
                    ))}
                    <td className="flex gap-2 p-2 text-sm">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingRow(row)}
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
      )}

      {editingRow && (
        <Dialog open={!!editingRow} onOpenChange={() => setEditingRow(null)}>
          <DialogTrigger asChild>
            <Button variant="outline">{t('ws-datasets.edit_row')}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('ws-datasets.edit_row')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {headers.map((header) => (
                <div key={header} className="space-y-2">
                  <label className="text-sm font-medium">{header}</label>
                  <Input
                    value={editingRow[header] || ''}
                    onChange={(e) =>
                      setEditingRow({ ...editingRow, [header]: e.target.value })
                    }
                    placeholder={`Enter ${header}`}
                  />
                </div>
              ))}
              <Button onClick={handleEditRow} className="w-full">
                {t('common.save')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
