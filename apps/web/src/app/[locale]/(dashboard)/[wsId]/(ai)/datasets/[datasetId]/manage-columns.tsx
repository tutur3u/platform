'use client';

import { Button } from '@repo/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@repo/ui/components/ui/dialog';
import { Input } from '@repo/ui/components/ui/input';
import { Plus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

interface Column {
  id: string;
  name: string;
  type: string;
}

interface Props {
  wsId: string;
  datasetId: string;
}

export function ManageColumns({ wsId, datasetId }: Props) {
  const t = useTranslations();
  const router = useRouter();
  const [columns, setColumns] = useState<Column[]>([]);
  const [isAddingColumn, setIsAddingColumn] = useState(false);
  const [newColumnName, setNewColumnName] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchColumns = async () => {
    setLoading(true);
    const response = await fetch(
      `/api/v1/workspaces/${wsId}/datasets/${datasetId}/columns`
    );
    if (response.ok) {
      const data = await response.json();
      setColumns(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchColumns();
  }, [datasetId]);

  const addColumn = async () => {
    if (!newColumnName.trim()) return;

    try {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/datasets/${datasetId}/columns`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newColumnName.trim() }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to create column');
      }

      const newColumn = await response.json();
      setColumns([...columns, newColumn]);
      setNewColumnName('');
      setIsAddingColumn(false);
      router.refresh();
    } catch (error) {
      console.error('Error adding column:', error);
    }
  };

  const removeColumn = async (columnId: string) => {
    const response = await fetch(
      `/api/v1/workspaces/${wsId}/datasets/${datasetId}/columns/${columnId}`,
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      }
    );

    if (response.ok) {
      setColumns(columns.filter((col) => col.id !== columnId));
      router.refresh();
    }
  };

  return (
    <Dialog open={isAddingColumn} onOpenChange={setIsAddingColumn}>
      <div className="space-y-4">
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <span className="text-muted-foreground text-sm">
              {t('common.loading')}
            </span>
          </div>
        ) : columns.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center">
            <p className="text-muted-foreground text-sm">
              {t('ws-datasets.no_data')}
            </p>
            <Button
              variant="outline"
              onClick={() => setIsAddingColumn(true)}
              className="mt-4"
            >
              <Plus className="mr-2 h-4 w-4" />
              {t('common.add_column')}
            </Button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {columns.map((column) => (
                <div
                  key={`${datasetId}-${column.name}`}
                  className="bg-secondary flex items-center gap-2 rounded-md px-3 py-1"
                >
                  <span className="text-sm">{column.name}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-4 w-4"
                    onClick={() => removeColumn(column.id)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>

            <DialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsAddingColumn(true)}
              >
                <Plus className="mr-2 h-4 w-4" />
                {t('common.add')}
              </Button>
            </DialogTrigger>
          </>
        )}
      </div>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('common.add_column')}</DialogTitle>
          <DialogDescription>
            {t('common.add_column_description')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">
              {t('common.column_name')}
            </label>
            <Input
              value={newColumnName}
              onChange={(e) => setNewColumnName(e.target.value)}
              placeholder="Enter column name"
            />
          </div>
          <Button onClick={addColumn} className="w-full">
            {t('common.add')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
