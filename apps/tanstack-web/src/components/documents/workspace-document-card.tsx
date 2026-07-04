'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { FileText, MoreHorizontal, Trash2 } from '@tuturuuu/icons';
import {
  deleteWorkspaceDocument,
  type WorkspaceDocumentSummary,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { toast } from '@tuturuuu/ui/sonner';
import { cn } from '@tuturuuu/utils/format';
import moment from 'moment';
import 'moment/locale/vi';
import { useState } from 'react';
import { useTranslations } from 'use-intl';

type WorkspaceDocumentCardProps = {
  document: WorkspaceDocumentSummary;
  locale: string;
  onDeleted?: () => Promise<void> | void;
  routeWorkspaceId: string;
  workspaceId: string;
};

export function WorkspaceDocumentCard({
  document,
  locale,
  onDeleted,
  routeWorkspaceId,
  workspaceId,
}: WorkspaceDocumentCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const router = useRouter();
  const t = useTranslations();
  const tCommon = useTranslations('common');

  const displayName = document.name || t('documents.untitled-document');
  const creationDate = document.created_at
    ? moment(document.created_at).locale(locale).fromNow()
    : null;

  const deleteMutation = useMutation({
    mutationFn: () => deleteWorkspaceDocument(workspaceId, document.id),
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : tCommon('error'));
    },
    onSuccess: async () => {
      toast.success(t('documents.delete-document'));
      setDeleteDialogOpen(false);
      await onDeleted?.();
    },
  });

  const openDocument = () => {
    if (menuOpen || deleteDialogOpen || deleteMutation.isPending) {
      return;
    }

    void router.navigate({
      href: `/${locale}/${routeWorkspaceId}/documents/${document.id}`,
    });
  };

  return (
    <>
      <Card
        className={cn(
          'group relative overflow-hidden rounded-lg border-l-4 border-l-primary/60 bg-primary/5 transition-all duration-200',
          'cursor-pointer hover:shadow-md hover:ring-1 hover:ring-primary/15'
        )}
        onClick={openDocument}
      >
        <div className="p-4">
          <div className="flex items-start gap-1">
            <div className="min-w-0 flex-1">
              <button
                className="-mx-1 -my-0.5 line-clamp-2 w-full cursor-pointer rounded-sm px-1 py-0.5 text-left font-semibold text-base text-foreground leading-tight transition-colors duration-200 active:bg-muted/50"
                onClick={(event) => {
                  event.stopPropagation();
                  openDocument();
                }}
                type="button"
              >
                {displayName}
              </button>
            </div>
            <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
              <DropdownMenuTrigger asChild>
                <Button
                  aria-label={t('common.actions')}
                  className={cn(
                    'h-7 w-7 shrink-0 p-0 transition-all duration-200',
                    'hover:scale-105 hover:bg-muted',
                    menuOpen
                      ? 'opacity-100'
                      : 'opacity-0 group-hover:opacity-100',
                    menuOpen && 'bg-muted ring-1 ring-border'
                  )}
                  onClick={(event) => event.stopPropagation()}
                  size="xs"
                  variant="ghost"
                >
                  <MoreHorizontal className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-56"
                onClick={(event) => event.stopPropagation()}
                sideOffset={5}
              >
                <DropdownMenuItem
                  className="cursor-pointer text-destructive"
                  onSelect={(event) => {
                    event.preventDefault();
                    setDeleteDialogOpen(true);
                    setMenuOpen(false);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                  {t('documents.delete-document')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {creationDate ? (
            <div className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">
              <FileText className="h-2.5 w-2.5 shrink-0" />
              <span className="truncate">{creationDate}</span>
            </div>
          ) : null}
        </div>
      </Card>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent
          className="sm:max-w-[425px]"
          onClick={(event) => event.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle>{t('documents.delete-document')}</DialogTitle>
            <DialogDescription>
              {t('documents.delete-document-confirmation')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              disabled={deleteMutation.isPending}
              onClick={() => setDeleteDialogOpen(false)}
              type="button"
              variant="outline"
            >
              {t('documents.cancel')}
            </Button>
            <Button
              disabled={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}
              type="button"
              variant="destructive"
            >
              {deleteMutation.isPending
                ? tCommon('processing')
                : t('documents.delete-document')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
