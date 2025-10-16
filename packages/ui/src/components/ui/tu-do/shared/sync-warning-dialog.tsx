'use client';

import { AlertTriangle, Loader2, WifiOff } from '@tuturuuu/icons';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@tuturuuu/ui/alert-dialog';

interface SyncWarningDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  synced: boolean;
  connected: boolean;
  onForceClose: () => void;
}

export function SyncWarningDialog({
  open,
  onOpenChange,
  synced,
  connected,
  onForceClose,
}: SyncWarningDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-3">
            {!connected ? (
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-dynamic-red/10">
                <WifiOff className="h-6 w-6 text-dynamic-red" />
              </div>
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-dynamic-yellow/10">
                <AlertTriangle className="h-6 w-6 text-dynamic-yellow" />
              </div>
            )}
            <div className="flex-1">
              <AlertDialogTitle>
                {!connected ? 'Connection Lost' : 'Syncing Changes'}
              </AlertDialogTitle>
              <AlertDialogDescription className="mt-1">
                {!connected
                  ? 'Unable to sync your changes. Attempting to reconnect...'
                  : 'Your changes are still being synced with the server.'}
              </AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>

        <div className="my-4 rounded-lg border bg-muted/50 p-4">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <div className="flex-1">
              <p className="font-medium text-sm">
                {!connected
                  ? 'Reconnecting to server...'
                  : 'Syncing your changes...'}
              </p>
              <p className="text-muted-foreground text-xs">
                {!connected
                  ? 'Please wait while we restore the connection'
                  : 'Please wait a moment for sync to complete'}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-1.5">
                <span
                  className={`h-2 w-2 rounded-full ${
                    connected
                      ? 'animate-pulse bg-dynamic-green'
                      : 'bg-dynamic-red'
                  }`}
                />
                <span className="text-xs">
                  {connected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span
                  className={`h-2 w-2 rounded-full ${
                    synced
                      ? 'bg-dynamic-green'
                      : 'animate-pulse bg-dynamic-yellow'
                  }`}
                />
                <span className="text-xs">{synced ? 'Synced' : 'Syncing'}</span>
              </div>
            </div>
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Wait for Sync</AlertDialogCancel>
          <AlertDialogAction
            onClick={onForceClose}
            className="bg-dynamic-red text-white hover:bg-dynamic-red/90"
          >
            Close Anyway
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
