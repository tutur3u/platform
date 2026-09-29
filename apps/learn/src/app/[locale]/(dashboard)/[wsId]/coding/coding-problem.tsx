'use client';

import { useTranslations } from 'next-intl';
import type { listCodingChallenges } from '@/lib/coding/challenges';

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
      <div className="mt-3 space-y-3">
        {challenge.publicCases.map((testCase, index) => (
          <div className="rounded-lg border p-3" key={testCase.input}>
            <p className="mb-2 font-medium text-xs">
              {t('publicCase', { number: index + 1 })}
            </p>
            <p className="mb-1 text-muted-foreground text-xs">{t('input')}</p>
            <pre className="overflow-auto rounded-md bg-muted/60 p-2 font-mono text-xs">
              {testCase.input}
            </pre>
            <p className="mt-3 mb-1 text-muted-foreground text-xs">
              {t('expectedOutput')}
            </p>
            <pre className="overflow-auto rounded-md bg-muted/60 p-2 font-mono text-xs">
              {testCase.output}
            </pre>
          </div>
        ))}
      </div>
      <p className="mt-5 text-muted-foreground text-xs">
        {t('hiddenCaseHint')}
      </p>
    </section>
  );
}
