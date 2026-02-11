'use client';

import { AlertTriangle, UserMinus } from '@tuturuuu/icons';
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
import { Input } from '@tuturuuu/ui/input';
import { toast } from '@tuturuuu/ui/sonner';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

interface Props {
  workspace?: (Workspace & { joined: boolean }) | null;
}

export default function RemoveYourself({ workspace }: Props) {
  const isSystemWs = workspace?.id === ROOT_WORKSPACE_ID;

  const t = useTranslations('ws-settings');
  const router = useRouter();

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isLeaving, setIsLeaving] = useState(false);
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const [confirmationInput, setConfirmationInput] = useState('');

  // Get current user ID on component mount
  useEffect(() => {
    const getUser = async () => {
      try {
        const { createClient } = await import('@tuturuuu/supabase/next/client');
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        setCurrentUserId(user?.id || null);
      } catch (error) {
        console.error('Error getting current user:', error);
        setCurrentUserId(null);
      }
    };

    getUser();
  }, []);

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

    await removeMemberFromWorkspace(workspace.id, currentUserId, t, {
      onSuccess: () => {
        router.push('/');
        router.refresh();
      },
      onError: () => {
        setIsLeaving(false);
        setShowLeaveDialog(false);
      },
    });
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

const removeMemberFromWorkspace = async (
  wsId: string,
  userId: string,
  t: (
    key:
      | 'leave_workspace_deleted'
      | 'leave_workspace_failed'
      | 'leave_workspace_success'
  ) => string,
  options?: {
    onSuccess?: () => void;
    onError?: () => void;
    onCompleted?: () => void;
  }
) => {
  try {
    const res = await fetch(`/api/workspaces/${wsId}/members?id=${userId}`, {
      method: 'DELETE',
    });

    if (!res.ok) {
      options?.onError?.();
      toast.error(t('leave_workspace_failed'));
      return;
    }

    const data = await res.json();
    const workspaceDeleted = data?.workspace_deleted === true;

    options?.onSuccess?.();
    toast.success(
      workspaceDeleted
        ? t('leave_workspace_deleted')
        : t('leave_workspace_success')
    );
  } catch (_) {
    options?.onError?.();
    toast.error(t('leave_workspace_failed'));
  } finally {
    options?.onCompleted?.();
  }
};
