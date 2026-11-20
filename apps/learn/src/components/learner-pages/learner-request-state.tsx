'use client';

import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';

export function LearnerRequestError({ retry }: { retry: () => void }) {
  const t = useTranslations();
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4"
    >
      <p className="text-muted-foreground text-sm">{t('courses.loadError')}</p>
      <Button variant="outline" onClick={retry}>
        {t('common.retry')}
      </Button>
    </div>
  );
}
