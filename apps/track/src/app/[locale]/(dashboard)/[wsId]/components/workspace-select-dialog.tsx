'use client';

import { useQuery } from '@tanstack/react-query';
import { CircleUserRound, Move, RefreshCw, Users } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface WorkspaceSelectDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (targetWorkspaceId: string) => Promise<void>;
  sessionTitle: string;
  currentWorkspaceId: string;
  isMoving: boolean;
}

interface Workspace {
  id: string;
  name: string;
  personal?: boolean;
}

export function WorkspaceSelectDialog({
  isOpen,
  onClose,
  onConfirm,
  sessionTitle,
  currentWorkspaceId,
  isMoving,
}: WorkspaceSelectDialogProps) {
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>('');
  const t = useTranslations('time-tracker.workspace_select_dialog');

  const { data: workspaces, isLoading } = useQuery<Workspace[]>({
    queryKey: ['workspaces'],
    queryFn: async () => {
      const response = await fetch('/api/v1/workspaces');
      if (!response.ok) {
        throw new Error('Failed to fetch workspaces');
      }
      return response.json();
    },
    enabled: isOpen,
  });

  const availableWorkspaces = workspaces
    ?.filter((ws) => ws.id !== currentWorkspaceId)
    // sort personal workspace first
    .sort((a, b) => {
      if (a.personal && !b.personal) return -1;
      if (!a.personal && b.personal) return 1;
      return 0;
    });

  const handleMove = async () => {
    if (!selectedWorkspaceId) {
      toast.error(t('errors.selectWorkspace'));
      return;
    }

    try {
      await onConfirm(selectedWorkspaceId);
      onClose();
      setSelectedWorkspaceId('');
    } catch (error) {
      console.error('Error moving session:', error);
      // Error handling is done in the parent component
    }
  };

  const handleClose = () => {
    if (!isMoving) {
      onClose();
      setSelectedWorkspaceId('');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Move className="h-5 w-5" />
            {t('title')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg bg-muted/30 p-3">
            <p className="text-muted-foreground text-sm">
              {t('movingSession')}
            </p>
            <p className="font-medium">{sessionTitle}</p>
          </div>

          <div className="space-y-2">
            <div className="font-medium text-sm">{t('selectTarget')}</div>
            {isLoading ? (
              <div className="flex items-center gap-2 py-3">
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span className="text-muted-foreground text-sm">
                  {t('loadingWorkspaces')}
                </span>
              </div>
            ) : !availableWorkspaces?.length ? (
              <div className="py-3 text-muted-foreground text-sm">
                {t('noWorkspaces')}
              </div>
            ) : (
              <Select
                value={selectedWorkspaceId}
                onValueChange={setSelectedWorkspaceId}
                disabled={isMoving}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('chooseWorkspace')} />
                </SelectTrigger>
                <SelectContent>
                  {availableWorkspaces.map((workspace) => (
                    <SelectItem key={workspace.id} value={workspace.id}>
                      <div className="flex items-center gap-2">
                        {workspace.personal ? <CircleUserRound /> : <Users />}
                        {workspace.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {availableWorkspaces?.length ? (
            <div className="rounded-lg bg-blue-50 p-3 text-blue-700 text-sm dark:bg-blue-950/30 dark:text-blue-300">
              <p className="mb-1 font-medium">{t('note')}</p>
              <ul className="space-y-1 text-xs">
                <li>• {t('noteItems.move')}</li>
                <li>• {t('noteItems.match')}</li>
                <li>• {t('noteItems.unassign')}</li>
              </ul>
            </div>
          ) : null}

          <div className="flex gap-2 pt-4">
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={isMoving}
              className="flex-1"
            >
              {t('actions.cancel')}
            </Button>
            <Button
              onClick={handleMove}
              disabled={
                isMoving || !selectedWorkspaceId || !availableWorkspaces?.length
              }
              className="flex-1"
            >
              {isMoving ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  {t('actions.moving')}
                </>
              ) : (
                <>
                  <Move className="mr-2 h-4 w-4" />
                  {t('actions.moveSession')}
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
