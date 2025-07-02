'use client';

import type { Workspace } from '@tuturuuu/types/db';
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
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { AlertTriangle, Trash2 } from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface Props {
  workspace?: Workspace | null;
}

export default function Security({ workspace }: Props) {
  const isSystemWs = workspace?.id === '00000000-0000-0000-0000-000000000000';

  const t = useTranslations('ws-settings');
  const router = useRouter();

  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [confirmationInput, setConfirmationInput] = useState('');

  const handleDeleteClick = () => {
    if (isSystemWs || !workspace) return;
    setShowDeleteDialog(true);
    setConfirmationInput('');
  };

  const handleConfirmDelete = async () => {
    if (isSystemWs || !workspace || confirmationInput !== workspace.name)
      return;
    setIsDeleting(true);

    await deleteWorkspace(workspace.id, {
      onSuccess: () => {
        router.push('/onboarding');
        router.refresh();
      },
      onError: () => {
        setIsDeleting(false);
        setShowDeleteDialog(false);
      },
    });
  };

  const isDeleteDisabled = confirmationInput !== workspace?.name || isDeleting;

  return (
    <>
      <div className="flex flex-col rounded-lg border border-border bg-foreground/5 p-6">
        <div className="mb-2 font-bold text-2xl text-foreground">
          {t('security')}
        </div>
        <div className="mb-6 text-foreground/80">
          {t('security_description')}
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-dynamic-red/20 bg-dynamic-red/5 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-dynamic-red" />
              <div className="flex-1">
                <h3 className="font-semibold text-dynamic-red">Danger Zone</h3>
                <p className="mt-1 text-foreground/70 text-sm">
                  Once you delete a workspace, there is no going back. Please be
                  certain.
                </p>
              </div>
            </div>
          </div>

          <Button
            onClick={handleDeleteClick}
            variant="destructive"
            className="w-full"
            disabled={!workspace || isSystemWs || isDeleting}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {isDeleting ? `${t('deleting')}...` : t('delete')}
          </Button>
        </div>
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-dynamic-red">
              <AlertTriangle className="h-5 w-5" />
              Delete Workspace
            </AlertDialogTitle>
            <AlertDialogDescription>
              This action <strong>cannot be undone</strong>. This will
              permanently delete the <strong>{workspace?.name}</strong>{' '}
              workspace and all of its data.
            </AlertDialogDescription>
            <div className="mt-3 text-foreground/80 text-sm">
              Please type <strong>{workspace?.name}</strong> to confirm.
            </div>
          </AlertDialogHeader>

          <div className="my-4">
            <Input
              placeholder={workspace?.name || ''}
              value={confirmationInput}
              onChange={(e) => setConfirmationInput(e.target.value)}
              className="w-full"
              disabled={isDeleting}
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isDeleteDisabled}
            >
              {isDeleting ? (
                <>
                  <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete workspace
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

const deleteWorkspace = async (
  wsId: string,
  options?: {
    onSuccess?: () => void;
    onError?: () => void;
    onCompleted?: () => void;
  }
) => {
  try {
    const res = await fetch(`/api/workspaces/${wsId}`, {
      method: 'DELETE',
    });

    if (!res.ok) {
      if (options?.onError) options.onError();
      toast({
        title: 'Failed to delete workspace',
        content: 'Please try again later.',
        color: 'red',
      });
      return;
    }

    if (options?.onSuccess) options.onSuccess();
    // eslint-disable-next-line no-unused-vars
  } catch (e) {
    if (options?.onError) options.onError();
    toast({
      title: 'Failed to delete workspace',
      content: 'Please try again later.',
      color: 'red',
    });
  } finally {
    if (options?.onCompleted) options.onCompleted();
  }
};
