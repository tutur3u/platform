'use client';

import { Button } from '@ncthub/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@ncthub/ui/dialog';
import { AlertTriangle, Trash2 } from '@ncthub/ui/icons';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface Props {
  wsId: string;
  datasetId: string;
}

export function ClearDataDialog({ wsId, datasetId }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const clearData = async () => {
    try {
      setLoading(true);

      // Clear columns first
      await fetch(`/api/v1/workspaces/${wsId}/datasets/${datasetId}/columns`, {
        method: 'DELETE',
      });

      // Then clear rows
      await fetch(`/api/v1/workspaces/${wsId}/datasets/${datasetId}/rows`, {
        method: 'DELETE',
      });

      // Refresh the query
      queryClient.invalidateQueries({ queryKey: [wsId, datasetId, 'columns'] });

      router.refresh();
      setOpen(false);
    } catch (error) {
      console.error('Error clearing data:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive">
          <Trash2 className="mr-2 h-4 w-4" />
          Clear Data
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            Clear Dataset Data
          </DialogTitle>
          <DialogDescription>
            This will permanently delete all data in this dataset, including all
            columns and rows. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={clearData} disabled={loading}>
            {loading ? 'Clearing...' : 'Clear Data'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
