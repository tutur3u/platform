'use client';

import { useMutation } from '@tanstack/react-query';
import { AlertTriangle, Trash2 } from '@tuturuuu/icons';
import { InternalApiError } from '@tuturuuu/internal-api/client';
import { deleteWorkspace } from '@tuturuuu/internal-api/workspaces';
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
import { useState } from 'react';

interface Props {
  workspace?: Pick<Workspace, 'id' | 'name' | 'personal'> | null;
}

export default function Security({ workspace }: Props) {
  const isSystemWs = workspace?.id === ROOT_WORKSPACE_ID;
  const isPersonalWs = workspace?.personal === true;

  const t = useTranslations('ws-settings');
  const tCommon = useTranslations('common');
  const router = useRouter();

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [confirmationInput, setConfirmationInput] = useState('');

  const deletion = useMutation({
    mutationFn: (wsId: string) => deleteWorkspace(wsId),
    retry: false,
    onSuccess: () => {
      router.push('/');
      router.refresh();
    },
    onError: (error) => {
      toast.error(t('delete_failed'), {
        description:
          error instanceof InternalApiError
            ? error.message
            : t('delete_failed_description'),
      });
    },
  });
  const isDeleting = deletion.isPending;

  const handleDeleteClick = () => {
    if (isSystemWs || isPersonalWs || !workspace) return;
    setShowDeleteDialog(true);
    setConfirmationInput('');
  };

  const handleConfirmDelete = () => {
    if (
      isSystemWs ||
      isPersonalWs ||
      !workspace ||
      isDeleting ||
      confirmationInput !== workspace.name
    )
      return;

    deletion.mutate(workspace.id);
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
                <h3 className="font-semibold text-dynamic-red">
                  {t('danger_zone')}
                </h3>
                <p className="mt-1 text-foreground/70 text-sm">
                  {t('delete_workspace_warning')}
                </p>
              </div>
            </div>
          </div>

          <Button
            onClick={handleDeleteClick}
            variant="destructive"
            className="w-full"
            disabled={!workspace || isSystemWs || isPersonalWs || isDeleting}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {isDeleting ? `${t('deleting')}...` : t('delete')}
          </Button>
        </div>
      </div>

      <AlertDialog
        open={showDeleteDialog}
        onOpenChange={(open) => {
          if (!isDeleting) setShowDeleteDialog(open);
        }}
      >
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-dynamic-red">
              <AlertTriangle className="h-5 w-5" />
              {t('delete')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t.rich('delete_confirmation_description', {
                name: workspace?.name ?? '',
                strong: (chunks) => <strong>{chunks}</strong>,
              })}
            </AlertDialogDescription>
            <div className="mt-3 text-foreground/80 text-sm">
              {t.rich('delete_confirmation_prompt', {
                name: workspace?.name ?? '',
                strong: (chunks) => <strong>{chunks}</strong>,
              })}
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
            <AlertDialogCancel disabled={isDeleting}>
              {tCommon('cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                handleConfirmDelete();
              }}
              disabled={isDeleteDisabled}
            >
              {isDeleting ? (
                <>
                  <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  {t('deleting')}...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  {t('delete')}
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
