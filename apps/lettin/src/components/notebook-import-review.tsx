'use client';
import type { LettinImportPreview } from '@tuturuuu/internal-api/lettin';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
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
      <ul className="max-h-60 overflow-y-auto rounded border p-4">
        {preview.entries.map((entry, index) => (
          <li key={index}>
            {entry.title} — {t(`kind${entry.kind}`)}
          </li>
        ))}
      </ul>
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
