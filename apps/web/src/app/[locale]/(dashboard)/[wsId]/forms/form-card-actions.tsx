'use client';

import { Archive, Download, ExternalLink, Trash2 } from '@tuturuuu/icons';
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
import { toast } from '@tuturuuu/ui/sonner';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export function FormCardActions({
  formId,
  href,
  workspaceSlug,
  isArchived,
  canManageForms,
}: {
  formId: string;
  href: string;
  workspaceSlug: string;
  isArchived: boolean;
  canManageForms: boolean;
}) {
  const t = useTranslations('forms');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);

  const handleArchive = async () => {
    setIsPending(true);
    try {
      const response = await fetch(
        `/api/v1/workspaces/${workspaceSlug}/forms/${formId}/archive`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ archived: !isArchived }),
        }
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        toast.error(payload.error ?? t('toast.failed_to_save_form'));
        return;
      }

      toast.success(
        isArchived ? t('toast.form_restored') : t('toast.form_archived')
      );
      setArchiveOpen(false);
      router.refresh();
    } catch {
      toast.error(t('toast.failed_to_save_form'));
    } finally {
      setIsPending(false);
    }
  };

  const handleDelete = async () => {
    setIsPending(true);
    try {
      const response = await fetch(
        `/api/v1/workspaces/${workspaceSlug}/forms/${formId}`,
        { method: 'DELETE' }
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        toast.error(payload.error ?? t('toast.failed_to_save_form'));
        return;
      }

      toast.success(t('toast.form_deleted'));
      setDeleteOpen(false);
      router.refresh();
    } catch {
      toast.error(t('toast.failed_to_save_form'));
    } finally {
      setIsPending(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" asChild>
          <a href={href}>
            <ExternalLink className="mr-2 h-4 w-4" />
            {t('studio.form_studio')}
          </a>
        </Button>
        <Button variant="outline" asChild>
          <a
            href={`/api/v1/workspaces/${workspaceSlug}/forms/${formId}/export`}
            download
          >
            <Download className="mr-2 h-4 w-4" />
            {t('settings.export_form')}
          </a>
        </Button>
        {canManageForms ? (
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setArchiveOpen(true)}
            >
              <Archive className="mr-2 h-4 w-4" />
              {isArchived ? t('pages.restore_form') : t('pages.archive_form')}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="border-destructive/40 text-destructive hover:bg-destructive/10"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {t('pages.delete_form')}
            </Button>
          </>
        ) : null}
      </div>

      <AlertDialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isArchived
                ? t('pages.restore_form_confirm_title')
                : t('pages.archive_form_confirm_title')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isArchived
                ? t('pages.restore_form_confirm_description')
                : t('pages.archive_form_confirm_description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>
              {tCommon('cancel')}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleArchive} disabled={isPending}>
              {isArchived ? t('pages.restore_form') : t('pages.archive_form')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('pages.delete_form_confirm_title')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('pages.delete_form_confirm_description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>
              {tCommon('cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('pages.delete_form')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
