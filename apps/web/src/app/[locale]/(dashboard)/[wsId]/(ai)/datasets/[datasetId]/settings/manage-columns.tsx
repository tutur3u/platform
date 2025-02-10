'use client';

import { EditColumnDialog } from './edit-column-dialog';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@tutur3u/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tutur3u/ui/components/ui/dialog';
import { Input } from '@tutur3u/ui/components/ui/input';
import { cn } from '@tutur3u/ui/lib/utils';
import { Loader2, Pencil, Plus, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface Column {
  id: string;
  name: string;
}

interface Props {
  wsId: string;
  datasetId: string;
}

export function ManageColumns({ wsId, datasetId }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [isAddingColumn, setIsAddingColumn] = useState(false);
  const [newColumnName, setNewColumnName] = useState('');
  const [editingColumn, setEditingColumn] = useState<Column | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  const { data: columns = [], isLoading } = useQuery<Column[]>({
    queryKey: [wsId, datasetId, 'columns'],
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/datasets/${datasetId}/columns`
      );
      if (!response.ok) throw new Error('Failed to fetch columns');
      return response.json();
    },
  });

  const addColumn = async () => {
    if (!newColumnName.trim()) return;

    try {
      // Optimistic update
      queryClient.setQueryData(
        [wsId, datasetId, 'columns'],
        (old: Column[]) => [
          ...(old || []),
          { id: 'temp', name: newColumnName, type: 'text' },
        ]
      );

      const response = await fetch(
        `/api/v1/workspaces/${wsId}/datasets/${datasetId}/columns`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newColumnName.trim() }),
        }
      );

      if (!response.ok) throw new Error('Failed to create column');

      // Invalidate query to refetch with actual data
      queryClient.invalidateQueries({ queryKey: [wsId, datasetId, 'columns'] });
      setNewColumnName('');
      setIsAddingColumn(false);
      router.refresh();
    } catch (error) {
      console.error('Error adding column:', error);
      // Revert optimistic update on error
      queryClient.invalidateQueries({ queryKey: [wsId, datasetId, 'columns'] });
    }
  };

  const removeColumn = async (columnId: string) => {
    try {
      // Optimistic update
      queryClient.setQueryData(
        [wsId, datasetId, 'columns'],
        (old: Column[]) => old?.filter((col) => col.id !== columnId) || []
      );

      const response = await fetch(
        `/api/v1/workspaces/${wsId}/datasets/${datasetId}/columns/${columnId}`,
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
        }
      );

      if (!response.ok) throw new Error('Failed to delete column');

      queryClient.invalidateQueries({ queryKey: [wsId, datasetId, 'columns'] });
      router.refresh();
    } catch (error) {
      console.error('Error removing column:', error);
      queryClient.invalidateQueries({ queryKey: [wsId, datasetId, 'columns'] });
    }
  };

  const removeAllColumns = async () => {
    try {
      // Optimistic update
      queryClient.setQueryData([wsId, datasetId, 'columns'], []);

      const response = await fetch(
        `/api/v1/workspaces/${wsId}/datasets/${datasetId}/columns`,
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
        }
      );

      if (!response.ok) throw new Error('Failed to delete all columns');

      queryClient.invalidateQueries({ queryKey: [wsId, datasetId, 'columns'] });
      router.refresh();
    } catch (error) {
      console.error('Error removing all columns:', error);
      queryClient.invalidateQueries({ queryKey: [wsId, datasetId, 'columns'] });
    }
  };

  const updateColumn = async (columnId: string, newName: string) => {
    try {
      // Optimistic update
      queryClient.setQueryData(
        [wsId, datasetId, 'columns'],
        (old: Column[]) =>
          old?.map((col) =>
            col.id === columnId ? { ...col, name: newName } : col
          ) || []
      );

      const response = await fetch(
        `/api/v1/workspaces/${wsId}/datasets/${datasetId}/columns/${columnId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newName.trim() }),
        }
      );

      if (!response.ok) throw new Error('Failed to update column');

      queryClient.invalidateQueries({ queryKey: [wsId, datasetId, 'columns'] });
      router.refresh();
    } catch (error) {
      console.error('Error updating column:', error);
      queryClient.invalidateQueries({ queryKey: [wsId, datasetId, 'columns'] });
    }
  };

  return (
    <Dialog open={isAddingColumn} onOpenChange={setIsAddingColumn}>
      <div className="space-y-4">
        {isLoading ? (
          <div className="flex h-64 flex-col items-center justify-center gap-2">
            <Loader2 className="h-6 w-6 animate-spin" />
            <p className="text-muted-foreground text-sm">Loading columns...</p>
          </div>
        ) : columns.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-4">
            <div className="bg-muted/50 flex h-16 w-16 items-center justify-center rounded-full">
              <Plus className="text-muted-foreground h-8 w-8" />
            </div>
            <div className="text-center">
              <p className="text-muted-foreground text-sm">
                No columns found in this dataset
              </p>
              <Button
                variant="outline"
                onClick={() => setIsAddingColumn(true)}
                className="mt-4"
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Your First Column
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {columns.map((column) => (
                  <div
                    key={`${datasetId}-${column.name}`}
                    className={cn(
                      'group relative flex flex-col gap-1 rounded-lg border p-4 transition-all',
                      'hover:border-foreground/20 hover:shadow-sm'
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="line-clamp-1 font-medium">
                            {column.name}
                          </span>
                          {/* <Badge
                            variant="secondary"
                            className={cn(
                              'px-2 py-0.5 text-xs font-normal',
                              getColumnTypeColor(column.type)
                            )}
                          >
                            {column.type}
                          </Badge> */}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={() => {
                            setEditingColumn(column);
                            setIsEditDialogOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="xs"
                          variant="destructive"
                          onClick={() => removeColumn(column.id)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}

                <Button
                  variant="outline"
                  className={cn(
                    'group flex h-auto flex-col items-center justify-center gap-2 p-8',
                    'hover:border-foreground/20 border-dashed'
                  )}
                  onClick={() => setIsAddingColumn(true)}
                >
                  <div className="bg-muted/50 group-hover:bg-muted flex h-10 w-10 items-center justify-center rounded-full transition-colors">
                    <Plus className="text-muted-foreground h-5 w-5" />
                  </div>
                  <span className="text-muted-foreground text-sm">
                    Add Column
                  </span>
                </Button>
              </div>

              <div className="flex justify-end">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={removeAllColumns}
                  disabled={columns.length === 0}
                >
                  Remove All Columns
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Add Column Dialog */}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Column</DialogTitle>
          <DialogDescription>
            Add a new column to your dataset
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Column Name</label>
            <Input
              value={newColumnName}
              onChange={(e) => setNewColumnName(e.target.value)}
              placeholder="Enter column name"
            />
          </div>
          <Button onClick={addColumn} className="w-full">
            Add
          </Button>
        </div>
      </DialogContent>

      {/* Edit Column Dialog */}
      {editingColumn && (
        <EditColumnDialog
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          column={editingColumn}
          onSave={updateColumn}
        />
      )}
    </Dialog>
  );
}
