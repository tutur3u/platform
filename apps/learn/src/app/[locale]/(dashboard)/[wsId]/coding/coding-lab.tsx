'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { listCodingChallenges } from '@/lib/coding/challenges';
import {
  CODING_LANGUAGES,
  type CodingLanguage,
  starterCode,
} from '@/lib/coding/languages';
import { getCodingSubmission, submitCodingSolution } from './actions';

type PublicChallenge = ReturnType<typeof listCodingChallenges>[number];

export function CodingLab({
  availableLanguages,
  challenges,
  readOnly,
  studentId,
  wsId,
}: {
  availableLanguages: CodingLanguage[];
  challenges: PublicChallenge[];
  readOnly: boolean;
  studentId?: string;
  wsId: string;
}) {
  const t = useTranslations('coding');
  const [selected, setSelected] = useState(challenges[0]?.slug ?? '');
  const [language, setLanguage] = useState<CodingLanguage>(
    availableLanguages[0] ?? 'python'
  );
  const challenge = challenges.find((entry) => entry.slug === selected);
  const [source, setSource] = useState(
    starterCode(availableLanguages[0] ?? 'python', challenge?.starterCode ?? '')
  );
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const submit = useMutation({
    mutationFn: () =>
      submitCodingSolution(wsId, studentId, selected, language, source),
    onSuccess: (id) => setSubmissionId(id),
  });
  const submission = useQuery({
    enabled: Boolean(submissionId),
    queryFn: () => getCodingSubmission(wsId, studentId, submissionId!),
    queryKey: ['coding-submission', wsId, studentId, submissionId],
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'queued' || status === 'running' ? 1500 : false;
    },
  });

  function selectChallenge(next: PublicChallenge) {
    setSelected(next.slug);
    setSource(starterCode(language, next.starterCode));
    setSubmissionId(null);
    submit.reset();
  }

  function selectLanguage(next: CodingLanguage) {
    setLanguage(next);
    setSource(starterCode(next, challenge?.starterCode ?? ''));
    setSubmissionId(null);
    submit.reset();
  }

  const judgeReady = availableLanguages.includes(language);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="font-medium text-primary text-sm">{t('eyebrow')}</p>
        <h1 className="font-semibold text-3xl tracking-tight">{t('title')}</h1>
        <p className="max-w-2xl text-muted-foreground">{t('description')}</p>
      </header>

      <div className="grid gap-5 xl:grid-cols-[18rem_minmax(0,1fr)]">
        <nav aria-label={t('challengeList')} className="space-y-2">
          {challenges.map((entry) => (
            <button
              aria-current={entry.slug === selected ? 'page' : undefined}
              className={`w-full rounded-lg border p-3 text-left transition-colors hover:bg-accent ${
                entry.slug === selected
                  ? 'border-primary bg-primary/5'
                  : 'border-border bg-background'
              }`}
              key={entry.slug}
              onClick={() => selectChallenge(entry)}
              type="button"
            >
              <span className="block font-medium">
                {t(`challenges.${entry.slug}.title`)}
              </span>
              <span className="mt-1 block text-muted-foreground text-xs">
                {t(`topics.${entry.topic}`)} ·{' '}
                {t(`difficulty.${entry.difficulty}`)}
              </span>
            </button>
          ))}
        </nav>

        {challenge ? (
          <div className="grid gap-5 2xl:grid-cols-2">
            <section className="space-y-5 rounded-lg border border-border bg-background p-5">
              <div className="space-y-2">
                <p className="text-muted-foreground text-xs uppercase tracking-wide">
                  {t(`topics.${challenge.topic}`)}
                </p>
                <h2 className="font-semibold text-2xl">
                  {t(`challenges.${challenge.slug}.title`)}
                </h2>
                <p className="whitespace-pre-line text-sm leading-6">
                  {t(`challenges.${challenge.slug}.prompt`)}
                </p>
              </div>
              <div className="space-y-3">
                <h3 className="font-medium text-sm">{t('sample')}</h3>
                {challenge.samples.map((sample) => (
                  <div className="grid gap-3 sm:grid-cols-2" key={sample.input}>
                    <div>
                      <p className="mb-1 text-muted-foreground text-xs">
                        {t('input')}
                      </p>
                      <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
                        {sample.input}
                      </pre>
                    </div>
                    <div>
                      <p className="mb-1 text-muted-foreground text-xs">
                        {t('output')}
                      </p>
                      <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
                        {sample.output}
                      </pre>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="space-y-4 rounded-lg border border-border bg-background p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-semibold text-lg">{t('editor')}</h2>
                <label className="text-sm">
                  <span className="sr-only">{t('language')}</span>
                  <select
                    className="h-9 rounded-md border border-input bg-background px-2"
                    onChange={(event) =>
                      selectLanguage(event.target.value as CodingLanguage)
                    }
                    value={language}
                  >
                    {CODING_LANGUAGES.map((entry) => (
                      <option key={entry} value={entry}>
                        {t(`languages.${entry}`)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="sr-only" htmlFor="coding-source">
                {t('editor')}
              </label>
              <textarea
                className="min-h-80 w-full resize-y rounded-md border border-input bg-muted/30 p-4 font-mono text-sm leading-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                id="coding-source"
                onChange={(event) => setSource(event.target.value)}
                spellCheck={false}
                value={source}
              />
              <div className="flex flex-wrap items-center gap-3">
                <button
                  className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground text-sm disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={
                    readOnly ||
                    !judgeReady ||
                    submit.isPending ||
                    !source.trim()
                  }
                  onClick={() => submit.mutate()}
                  type="button"
                >
                  {submit.isPending ? t('submitting') : t('submit')}
                </button>
                {readOnly ? (
                  <p className="text-muted-foreground text-sm">
                    {t('parentReadOnly')}
                  </p>
                ) : !judgeReady ? (
                  <p className="text-muted-foreground text-sm">
                    {t('judgeUnavailable')}
                  </p>
                ) : null}
              </div>
              {submit.error ? (
                <p className="text-destructive text-sm" role="alert">
                  {submit.error.message}
                </p>
              ) : null}
              {submissionId ? (
                <div
                  aria-live="polite"
                  className="rounded-md border border-border p-3 text-sm"
                >
                  {submission.data?.result ? (
                    <>
                      <p className="font-medium">
                        {t('passed', {
                          passed: submission.data.result.passed,
                          total: submission.data.result.total,
                        })}
                      </p>
                      <ul className="mt-2 space-y-1 text-muted-foreground">
                        {submission.data.result.results.map((result) => (
                          <li key={result.index}>
                            {t('case', { number: result.index + 1 })}:{' '}
                            {t(`result.${result.reason}`)}
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : submission.error ||
                    (submission.data?.status &&
                      !['queued', 'running'].includes(
                        submission.data.status
                      )) ? (
                    <p>{t('judgeFailed')}</p>
                  ) : (
                    <p>{t('judging')}</p>
                  )}
                </div>
              ) : null}
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}
