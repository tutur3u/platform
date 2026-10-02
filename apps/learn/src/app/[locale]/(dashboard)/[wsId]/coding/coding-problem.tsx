'use client';

import { useTranslations } from 'next-intl';
import type { listCodingChallenges } from '@/lib/coding/challenges';
import { CodingCases } from './coding-cases';

type PublicChallenge = ReturnType<typeof listCodingChallenges>[number];

export function CodingProblem({ challenge }: { challenge: PublicChallenge }) {
  const t = useTranslations('coding');
  return (
    <section className="h-full min-h-0 overflow-auto p-5 lg:border-r">
      <p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
        {t(`topics.${challenge.topic}`)} ·{' '}
        {t(`difficulty.${challenge.difficulty}`)}
      </p>
      <h1 className="mt-2 font-semibold text-2xl tracking-tight">
        {t(`challenges.${challenge.slug}.title`)}
      </h1>
      <p className="mt-5 whitespace-pre-line text-sm leading-7">
        {t(`challenges.${challenge.slug}.prompt`)}
      </p>
      <h2 className="mt-7 border-b pb-2 font-semibold text-sm">
        {t('publicTests')}
      </h2>
      <div className="mt-3">
        <CodingCases cases={challenge.publicCases} key={challenge.slug} />
      </div>
      <p className="mt-5 text-muted-foreground text-xs">
        {t('hiddenCaseHint')}
      </p>
    </section>
  );
}
