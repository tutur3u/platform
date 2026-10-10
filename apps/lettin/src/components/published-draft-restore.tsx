'use client';
import type { LettinDraft } from '@tuturuuu/internal-api/lettin';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export function PublishedDraftRestore({
  published,
  disabled,
  onRestore,
}: {
  published: LettinDraft | null;
  disabled: boolean;
  onRestore: (draft: LettinDraft) => void;
}) {
  const t = useTranslations('lettin');
  const [open, setOpen] = useState(false);
  const blocked = disabled || !published;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={blocked}>
          {t('restorePublishedDraft')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('restorePublishedDraft')}</DialogTitle>
          <DialogDescription>
            {t('restorePublishedDraftHint')}
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t('cancel')}
          </Button>
          <Button
            disabled={blocked}
            onClick={() => {
              if (blocked || !published) return;
              onRestore(structuredClone(published));
              setOpen(false);
            }}
          >
            {t('stagePublishedDraft')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
