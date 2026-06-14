'use client';

import { Archive, Trash2, TriangleAlert } from '@tuturuuu/icons';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@tuturuuu/ui/alert-dialog';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';

export function LifecyclePanel({
  archiveDisabled,
  archivePending,
  archiveTitle,
  deleteDisabled,
  deletePending,
  deleteTitle,
  description,
  onArchive,
  onDelete,
  title,
}: {
  archiveDisabled?: boolean;
  archivePending?: boolean;
  archiveTitle?: string;
  deleteDisabled?: boolean;
  deletePending?: boolean;
  deleteTitle?: string;
  description?: string;
  onArchive?: () => void;
  onDelete?: () => void;
  title: string;
}) {
  const t = useTranslations('inventory.operator.forms');

  return (
    <section className="grid min-w-0 gap-3 rounded-lg border border-border bg-muted/15 p-3">
      <div className="flex min-w-0 items-start gap-3">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-destructive/10 text-destructive">
          <TriangleAlert className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h3 className="font-semibold text-sm">{title}</h3>
          <p className="mt-1 text-muted-foreground text-sm leading-6">
            {description ?? t('lifecycleDescription')}
          </p>
        </div>
      </div>
      <div className="grid min-w-0 gap-2 sm:grid-cols-2">
        {onArchive ? (
          <div className="grid min-w-0 gap-2 rounded-md border border-border bg-background p-3">
            <div className="min-w-0">
              <p className="font-medium text-sm">
                {archiveTitle ?? t('archive')}
              </p>
              <p className="mt-1 text-muted-foreground text-xs leading-5">
                {t('archiveDescription')}
              </p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  className="w-fit"
                  disabled={archiveDisabled || archivePending}
                  type="button"
                  variant="outline"
                >
                  <Archive className="h-4 w-4" />
                  {archivePending ? t('saving') : t('archive')}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {t('archiveConfirmTitle')}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {t('archiveConfirmDescription')}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
                  <AlertDialogAction onClick={onArchive}>
                    {t('archive')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ) : null}
        {onDelete ? (
          <div className="grid min-w-0 gap-2 rounded-md border border-destructive/25 bg-destructive/5 p-3">
            <div className="min-w-0">
              <p className="font-medium text-sm">
                {deleteTitle ?? t('delete')}
              </p>
              <p className="mt-1 text-muted-foreground text-xs leading-5">
                {t('deleteDescription')}
              </p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  className="w-fit"
                  disabled={deleteDisabled || deletePending}
                  type="button"
                  variant="destructive"
                >
                  <Trash2 className="h-4 w-4" />
                  {deletePending ? t('deleting') : t('delete')}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('deleteConfirmTitle')}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t('deleteConfirmDescription')}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={onDelete}
                  >
                    {t('delete')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ) : null}
      </div>
    </section>
  );
}
