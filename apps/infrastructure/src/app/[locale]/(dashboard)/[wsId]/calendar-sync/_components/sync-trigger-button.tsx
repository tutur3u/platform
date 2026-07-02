'use client';

import { RefreshCcw } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/sonner';
import { useState } from 'react';

interface Props {
  wsId: string;
}

export default function SyncTriggerButton({ wsId }: Props) {
  const [isSyncing, setIsSyncing] = useState(false);

  const triggerSync = async () => {
    setIsSyncing(true);

    try {
      // Calculate date range: 60 days past, 90 days future (150 days total)
      // Reduced from 270 days for better performance while still covering most use cases
      const now = new Date();
      const startDate = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
      const endDate = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

      const response = await fetch('/api/v1/calendar/auth/active-sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          wsId,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to trigger sync');
      }

      const result = await response.json();

      toast.success('Sync completed successfully', {
        description: `${result.inserted || 0} added, ${result.updated || 0} updated, ${result.deleted || 0} deleted (${result.durationMs || 0}ms)`,
      });

      // Refresh the page after a short delay to show updated data
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (error) {
      console.error('Sync error:', error);
      toast.error('Sync failed', {
        description:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <Button
      onClick={triggerSync}
      disabled={isSyncing}
      size="sm"
      className="gap-2"
    >
      <RefreshCcw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
      {isSyncing ? 'Syncing...' : 'Trigger Sync'}
    </Button>
  );
}
