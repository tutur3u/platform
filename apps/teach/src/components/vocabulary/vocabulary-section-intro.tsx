'use client';

import { useTranslations } from 'next-intl';

export function VocabularySectionIntro({ count }: { count: number }) {
  const t = useTranslations('teachVocabulary');

  return (
    <div>
      <h2 className="font-semibold text-lg">{t('bankTitle', { count })}</h2>
      <p className="text-muted-foreground text-sm">{t('bankDescription')}</p>
    </div>
  );
}
