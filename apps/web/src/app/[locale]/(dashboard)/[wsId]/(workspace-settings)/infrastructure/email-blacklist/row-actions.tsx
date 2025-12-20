'use client';

import type { Row } from '@tanstack/react-table';
import { Ellipsis } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { toast } from '@tuturuuu/ui/sonner';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { EmailBlacklistEntry } from './columns';
import EmailBlacklistForm from './form';

interface EmailBlacklistRowActionsProps {
  row: Row<EmailBlacklistEntry>;
}

export function EmailBlacklistRowActions({
  row,
}: EmailBlacklistRowActionsProps) {
  const t = useTranslations();
  const router = useRouter();

  const entry = row.original;
  const [open, setOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleFormSuccess = () => {
    toast.success(t('email-blacklist.entry-updated'), {
      description: `"${entry.value}" ${t('email-blacklist.has-been-updated')}`,
    });
    setOpen(false);
    router.refresh();
  };

  const handleFormError = (error: string) => {
    toast.error(t('email-blacklist.error'), {
      description: error,
    });
  };

  const deleteEntry = async () => {
    if (isDeleting) return;

    setIsDeleting(true);
    try {
      const res = await fetch(
        `/api/v1/infrastructure/email-blacklist/${entry.id}`,
        {
          method: 'DELETE',
        }
      );

      if (res.ok) {
        toast.success(t('email-blacklist.entry-deleted'), {
          description: `"${entry.value}" ${t('email-blacklist.has-been-deleted')}`,
        });
        router.refresh();
      } else {
        const data = await res.json();
        toast.error(t('email-blacklist.delete-failed'), {
          description: data.message || t('email-blacklist.delete-error'),
        });
      }
    } catch (_error) {
      toast.error(t('email-blacklist.delete-failed'), {
        description: t('email-blacklist.network-error'),
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-h-[80vh] max-w-2xl overflow-y-scroll"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>{t('email-blacklist.edit-entry')}</DialogTitle>
            <DialogDescription>
              {t('email-blacklist.edit-entry-description')}
            </DialogDescription>
          </DialogHeader>

          <EmailBlacklistForm
            data={entry}
            onSuccess={handleFormSuccess}
            onError={handleFormError}
          />
        </DialogContent>
      </Dialog>

      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="flex h-8 w-8 p-0 data-[state=open]:bg-muted"
          >
            <Ellipsis className="h-4 w-4" />
            <span className="sr-only">{t('common.actions')}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem onClick={() => setOpen(true)}>
            {t('common.edit')}
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={deleteEntry}
            disabled={!entry.id || isDeleting}
            className="text-dynamic-red"
          >
            {isDeleting ? t('common.deleting') : t('common.delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
