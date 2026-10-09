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
import { DocumentView } from './document-view';

export function PublicationPreview({
  draft,
  published,
}: {
  draft: LettinDraft;
  published: LettinDraft | null;
}) {
  const t = useTranslations('lettin');
  const [mode, setMode] = useState<'draft' | 'published'>('draft');
  const showPublished = mode === 'published' && published !== null;

  return (
    <Dialog onOpenChange={() => setMode('draft')}>
      <DialogTrigger asChild>
        <Button variant="outline">{t('preview')}</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('privatePreview')}</DialogTitle>
          <DialogDescription>{t('previewHint')}</DialogDescription>
        </DialogHeader>
        <fieldset aria-label={t('previewVersion')} className="flex gap-2">
          <Button
            variant={showPublished ? 'outline' : 'default'}
            aria-pressed={!showPublished}
            onClick={() => setMode('draft')}
          >
            {t('previewCurrentDraft')}
          </Button>
          <Button
            variant={showPublished ? 'default' : 'outline'}
            aria-pressed={showPublished}
            disabled={!published}
            onClick={() => setMode('published')}
          >
            {t('previewPublishedSnapshot')}
          </Button>
        </fieldset>
        <p role="status" className="text-muted-foreground text-sm">
          {t(
            showPublished
              ? 'previewPublishedHint'
              : published
                ? 'previewDraftHint'
                : 'previewUnpublishedHint'
          )}
        </p>
        <DocumentView draft={showPublished ? published : draft} />
      </DialogContent>
    </Dialog>
  );
}
