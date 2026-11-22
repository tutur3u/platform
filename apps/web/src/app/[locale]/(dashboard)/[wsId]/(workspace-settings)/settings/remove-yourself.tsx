'use client';

import { AlertTriangle, UserMinus } from '@tuturuuu/icons';
import { removeWorkspaceMember } from '@tuturuuu/internal-api/workspaces';
import type { Workspace } from '@tuturuuu/types';
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
import { Button } from '@tuturuuu/ui/button';
import { getWorkspaceAccessRemovalRefusalMessage } from '@tuturuuu/ui/custom/workspace-access';
import { Input } from '@tuturuuu/ui/input';
import { toast } from '@tuturuuu/ui/sonner';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface Props {
  workspace?: (Workspace & { joined: boolean }) | null;
  currentUserId?: string | null;
}

export default function RemoveYourself({ workspace, currentUserId }: Props) {
  const isSystemWs = workspace?.id === ROOT_WORKSPACE_ID;

  const t = useTranslations('ws-settings');
  const tMembers = useTranslations('ws-members');
  const router = useRouter();

  const [isLeaving, setIsLeaving] = useState(false);
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const [confirmationInput, setConfirmationInput] = useState('');

  const handleLeaveClick = () => {
    if (isSystemWs || !workspace || !currentUserId) return;
    setShowLeaveDialog(true);
    setConfirmationInput('');
  };

  const handleConfirmLeave = async () => {
    if (
      isSystemWs ||
      !workspace ||
      !currentUserId ||
      confirmationInput !== workspace.name
    )
      return;

    setIsLeaving(true);

    try {
      const result = await removeWorkspaceMember(workspace.id, {
        userId: currentUserId,
      });
      router.push('/');
      router.refresh();
      toast.success(
        result.workspace_deleted
          ? t('leave_workspace_deleted')
          : t('leave_workspace_success')
      );
    } catch (error) {
      setIsLeaving(false);
      setShowLeaveDialog(false);
      toast.error(
        getWorkspaceAccessRemovalRefusalMessage(error, {
          creator: tMembers('creator_removal_refused'),
          lastManager: tMembers('last_manager_removal_refused'),
        }) ?? t('leave_workspace_failed')
      );
    }
  };

  const isLeaveDisabled = confirmationInput !== workspace?.name || isLeaving;

  // Don't render if it's a system workspace
  if (isSystemWs || !currentUserId) {
    return null;
  }

  return (
    <>
      <div className="flex flex-col rounded-lg border border-border bg-foreground/5 p-6">
        <div className="mb-2 font-bold text-2xl text-foreground">
          {t('leave_workspace')}
        </div>
        <div className="mb-6 text-foreground/80">
          {t('leave_workspace_description')}
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-dynamic-red/20 bg-dynamic-red/5 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-dynamic-red" />
              <div className="flex-1">
                <h3 className="font-semibold text-dynamic-red">
                  {t('danger_zone')}
                </h3>
                <p className="mt-1 text-foreground/70 text-sm">
                  {t('leave_workspace_warning')}
                </p>
              </div>
            </div>
          </div>

          <Button
            onClick={handleLeaveClick}
            variant="destructive"
            className="w-full"
            disabled={!workspace || isSystemWs || isLeaving}
          >
            <UserMinus className="mr-2 h-4 w-4" />
            {isLeaving ? `${t('leaving')}...` : t('leave_workspace')}
          </Button>
        </div>
      </div>

      <AlertDialog open={showLeaveDialog} onOpenChange={setShowLeaveDialog}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-dynamic-red">
              <AlertTriangle className="h-5 w-5" />
              {t('leave_workspace')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('leave_workspace_confirmation')}{' '}
              <strong className="underline">{workspace?.name}</strong>.
            </AlertDialogDescription>
            <div className="mt-3 text-foreground/80 text-sm">
              {t('type_workspace_name_to_confirm')}{' '}
              <strong>{workspace?.name}</strong> {t('to_confirm')}.
            </div>
          </AlertDialogHeader>

          <div className="my-4">
            <Input
              placeholder={workspace?.name || ''}
              value={confirmationInput}
              onChange={(e) => setConfirmationInput(e.target.value)}
              className="w-full"
              disabled={isLeaving}
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLeaving}>
              {t('cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmLeave}
              disabled={isLeaveDisabled}
            >
              {isLeaving ? (
                <>
                  <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  {t('leaving')}...
                </>
              ) : (
                <>
                  <UserMinus className="mr-2 h-4 w-4" />
                  {t('leave_workspace')}
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
