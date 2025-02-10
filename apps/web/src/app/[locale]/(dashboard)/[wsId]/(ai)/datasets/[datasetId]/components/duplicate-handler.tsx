'use client';

import { Button } from '@tutur3u/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tutur3u/ui/components/ui/dialog';
import { Progress } from '@tutur3u/ui/components/ui/progress';
import { ScrollArea } from '@tutur3u/ui/components/ui/scroll-area';
import { useToast } from '@tutur3u/ui/hooks/use-toast';
import {
  AlertCircle,
  CheckCircle,
  Loader2,
  RefreshCw,
  Trash2,
  XCircle,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface Props {
  wsId: string;
  datasetId: string;
}

interface LogEntry {
  message: string;
  type: 'info' | 'success' | 'error' | 'warning';
  timestamp: Date;
}

export function DuplicateHandler({ wsId, datasetId }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [isRemoving, setIsRemoving] = useState(false);

  const addLog = (
    message: string,
    type: 'info' | 'success' | 'error' | 'warning' = 'info'
  ) => {
    setLogs((prev) => [...prev, { message, type, timestamp: new Date() }]);
  };

  const handleDetectDuplicates = async () => {
    try {
      setIsProcessing(true);
      setProgress(0);
      setLogs([]);
      addLog('Starting duplicate detection...', 'info');

      // Start detection
      setProgress(10);
      addLog('Fetching dataset rows...', 'info');

      const response = await fetch(
        `/api/v1/workspaces/${wsId}/datasets/${datasetId}/duplicates/detect`,
        {
          method: 'POST',
        }
      );

      if (!response.ok) {
        throw new Error('Failed to detect duplicates');
      }

      setProgress(50);
      addLog('Processing response...', 'info');

      const data = await response.json();
      setProgress(100);

      if (data.duplicateCount === 0) {
        addLog('No duplicates found!', 'success');
      } else {
        addLog(
          `Found ${data.duplicateCount} duplicate rows`,
          data.duplicateCount > 0 ? 'warning' : 'success'
        );
        setDuplicateCount(data.duplicateCount);
      }
    } catch (error) {
      console.error('Error detecting duplicates:', error);
      addLog(
        `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error'
      );
      toast({
        title: 'Error',
        description: 'Failed to detect duplicates. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRemoveDuplicates = async () => {
    try {
      setIsRemoving(true);
      addLog('Starting duplicate removal...', 'info');
      setProgress(0);

      // Start removal
      setProgress(10);
      addLog('Preparing to remove duplicates...', 'info');

      const response = await fetch(
        `/api/v1/workspaces/${wsId}/datasets/${datasetId}/duplicates/remove`,
        {
          method: 'POST',
        }
      );

      if (!response.ok) {
        throw new Error('Failed to remove duplicates');
      }

      setProgress(50);
      addLog('Processing removal...', 'info');

      const data = await response.json();
      setProgress(100);

      addLog(`Removed ${data.removedCount} duplicate rows`, 'success');
      setDuplicateCount(0);

      // Refresh the page data
      router.refresh();

      toast({
        title: 'Success',
        description: `Successfully removed ${data.removedCount} duplicate rows.`,
      });
    } catch (error) {
      console.error('Error removing duplicates:', error);
      addLog(
        `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error'
      );
      toast({
        title: 'Error',
        description: 'Failed to remove duplicates. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsRemoving(false);
      setProgress(100);
    }
  };

  const getLogIcon = (type: LogEntry['type']) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'warning':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      default:
        return <Loader2 className="h-4 w-4 text-blue-500" />;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <div className="flex items-center gap-2">
        <DialogTrigger asChild>
          <Button variant="outline" onClick={() => setIsOpen(true)}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Manage Duplicates
          </Button>
        </DialogTrigger>
      </div>

      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Manage Duplicate Rows</DialogTitle>
          <DialogDescription>
            Detect and remove duplicate rows in your dataset
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {(isProcessing || isRemoving) && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Progress</span>
                <span className="text-muted-foreground text-sm">
                  {progress}%
                </span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}

          <ScrollArea className="h-[200px] rounded-md border p-4">
            <div className="space-y-2">
              {logs.map((log, index) => (
                <div key={index} className="flex items-center gap-2 text-sm">
                  {getLogIcon(log.type)}
                  <span
                    className={
                      log.type === 'error'
                        ? 'text-red-500'
                        : log.type === 'warning'
                          ? 'text-yellow-500'
                          : log.type === 'success'
                            ? 'text-green-500'
                            : 'text-muted-foreground'
                    }
                  >
                    {log.message}
                  </span>
                  <span className="text-muted-foreground ml-auto text-xs">
                    {log.timestamp.toLocaleTimeString()}
                  </span>
                </div>
              ))}
              {logs.length === 0 && (
                <div className="text-muted-foreground text-center text-sm">
                  No logs yet. Start by detecting duplicates.
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        <DialogFooter>
          <div className="flex w-full items-center gap-2">
            <Button
              variant="outline"
              onClick={handleDetectDuplicates}
              disabled={isProcessing || isRemoving}
              className="flex-1"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Detecting...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Detect Duplicates
                </>
              )}
            </Button>

            {duplicateCount > 0 && (
              <Button
                variant="destructive"
                onClick={handleRemoveDuplicates}
                disabled={isProcessing || isRemoving}
                className="flex-1"
              >
                {isRemoving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Removing...
                  </>
                ) : (
                  <>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Remove {duplicateCount} Duplicates
                  </>
                )}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
