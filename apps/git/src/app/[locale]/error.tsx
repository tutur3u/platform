'use client';

import { RotateCcw } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';

export default function ErrorPage({ reset }: { reset: () => void }) {
  const t = useTranslations('git');

  return (
    <main className="grid min-h-[70vh] place-items-center p-6">
      <div className="max-w-md space-y-4 text-center">
        <h1 className="font-semibold text-2xl">{t('generic_error')}</h1>
        <p className="text-muted-foreground text-sm">
          {t('generic_error_description')}
        </p>
        <Button onClick={reset} variant="outline">
          <RotateCcw className="mr-2 h-4 w-4" />
          {t('retry')}
        </Button>
      </div>
    </main>
  );
}
