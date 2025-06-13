'use client';

import type { WorkspaceDataset } from '@ncthub/types/db';
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
import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface Props {
  wsId: string;
  dataset: WorkspaceDataset;
}

export function DeleteDatasetDialog({ wsId, dataset }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const deleteDataset = async () => {
    try {
      setLoading(true);
      await fetch(`/api/v1/workspaces/${wsId}/datasets/${dataset.id}`, {
        method: 'DELETE',
      });

      router.push(`/workspaces/${wsId}/datasets`);
    } catch (error) {
      console.error('Error deleting dataset:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive">
          <Trash2 className="mr-2 h-4 w-4" />
          Delete Dataset
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            Delete Dataset
          </DialogTitle>
          <DialogDescription>
            Are you sure you want to delete &quot;{dataset.name}&quot;? This
            action will permanently delete the dataset and all its data. This
            cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={deleteDataset}
            disabled={loading}
          >
            {loading ? 'Deleting...' : 'Delete Dataset'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
