'use client';

import { Button } from '@tuturuuu/ui/button';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

export default function Slogan() {
  const t = useTranslations();
  return (
    <section className="relative overflow-hidden p-4">
      <div className="mx-auto max-w-2xl">
        <h2 className="mb-4 font-bold text-xl md:text-3xl">
          {t('slogan.title')}
        </h2>
        <p className="mb-8 text-balance text-muted-foreground">
          {t('slogan.description')}
        </p>
        <Link href="/contact">
          <Button size="lg">{t('slogan.join_waitlist')}</Button>
        </Link>
      </div>
    </section>
  );
}
