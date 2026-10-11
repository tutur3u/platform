'use client';
import type { LettinImportPreview } from '@tuturuuu/internal-api/lettin';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { NotebookImportEntries } from './notebook-import-entries';
export function NotebookImportReview({
  preview,
  pending,
  onApply,
  onBack,
}: {
  preview: LettinImportPreview;
  pending: boolean;
  onApply: () => void;
  onBack: () => void;
}) {
  const t = useTranslations('lettin');
  return (
    <section className="space-y-4">
      <h3 className="font-semibold">{preview.title}</h3>
      <p>{t('notebookImportSummary', { count: preview.count })}</p>
      <p>{t('notebookImportBoundary')}</p>
      <NotebookImportEntries
        key={preview.id}
        preview={preview}
        pending={pending}
      />
      <div className="flex gap-2">
        <Button disabled={pending} onClick={onApply}>
          {t('createImport')}
        </Button>
        <Button variant="ghost" disabled={pending} onClick={onBack}>
          {t('back')}
        </Button>
      </div>
    </section>
  );
}
