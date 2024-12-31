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
import { useState } from 'react';

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

  const addColumn = async () => {
    if (!newColumnName.trim()) return;

    const response = await fetch(
      `/api/v1/workspaces/${wsId}/datasets/${datasetId}/columns`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newColumnName }),
      }
    );

    if (response.ok) {
      setColumns([
        ...columns,
        { id: Date.now().toString(), name: newColumnName, type: 'string' },
      ]);
      setNewColumnName('');
      setIsAddingColumn(false);
      router.refresh();
    }
  };

  const removeColumn = async (columnId: string) => {
    const response = await fetch(
      `/api/v1/workspaces/${wsId}/datasets/${datasetId}/columns/${columnId}`,
      { method: 'DELETE' }
    );

    if (response.ok) {
      setColumns(columns.filter((col) => col.id !== columnId));
      router.refresh();
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {columns.map((column) => (
          <div
            key={column.id}
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

      <Dialog open={isAddingColumn} onOpenChange={setIsAddingColumn}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <Plus className="mr-2 h-4 w-4" />
            {t('common.add')}
          </Button>
        </DialogTrigger>
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
    </div>
  );
}
