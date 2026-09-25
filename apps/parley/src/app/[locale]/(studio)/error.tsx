'use client';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
export default function ErrorState({ reset }: { reset: () => void }) {
  const t = useTranslations('parley');
  return (
    <section role="alert" className="rounded-xl border p-8">
      <h1 className="font-semibold text-xl">{t('load_failed')}</h1>
      <p className="my-3 text-muted-foreground">{t('load_failed_hint')}</p>
      <Button onClick={reset}>{t('retry')}</Button>
    </section>
  );
}
