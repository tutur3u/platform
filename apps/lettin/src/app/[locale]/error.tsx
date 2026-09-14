'use client';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
export default function ErrorPage({ reset }: { reset: () => void }) {
  const t = useTranslations('lettin');
  return (
    <main className="p-10" role="alert">
      <h1 className="mb-4 text-3xl">{t('requestFailed')}</h1>
      <Button onClick={reset}>{t('retry')}</Button>
    </main>
  );
}
