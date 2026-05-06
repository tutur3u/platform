'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Heart, Sparkles, Zap } from '@tuturuuu/icons';
import {
  getTulearnPractice,
  submitTulearnPractice,
} from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import {
  EmptyState,
  type IconComponent,
  LoadingState,
  Section,
  usePageMotion,
  useStudentId,
} from './shared';

export function PracticePage({ wsId }: { wsId: string }) {
  const t = useTranslations();
  const studentId = useStudentId();
  const queryClient = useQueryClient();
  const scopeRef = usePageMotion();
  const practice = useQuery({
    queryFn: () => getTulearnPractice(wsId, studentId),
    queryKey: ['tulearn', wsId, studentId, 'practice'],
  });
  const submit = useMutation({
    mutationFn: (correct: boolean) =>
      practice.data?.item
        ? submitTulearnPractice(
            wsId,
            {
              correct,
              itemId: practice.data.item.id,
              type: practice.data.item.type,
            },
            studentId
          )
        : Promise.reject(new Error('No practice item')),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tulearn', wsId, studentId] });
    },
  });

  if (practice.isLoading) return <LoadingState />;
  if (!practice.data?.item) return <EmptyState label={t('practice.empty')} />;

  const result = submit.data;

  return (
    <Section
      description={t('practice.description')}
      refValue={scopeRef}
      title={t('practice.title')}
    >
      <div className="mx-auto grid max-w-5xl gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div
          className="rounded-[2.25rem] border border-dynamic-green/25 bg-background p-6 shadow-sm md:p-8"
          data-tulearn-reveal
        >
          <Badge className="mb-5 bg-dynamic-blue/15 text-dynamic-blue hover:bg-dynamic-blue/15">
            {practice.data.item.courseName}
          </Badge>
          <h2 className="font-bold text-[clamp(2rem,4vw,4.25rem)] leading-none tracking-normal">
            {practice.data.item.title}
          </h2>
          <p className="mt-6 text-lg text-muted-foreground leading-8">
            {practice.data.item.prompt ?? t('practice.title')}
          </p>
          {result ? (
            <div
              className={cn(
                'mt-8 rounded-[1.75rem] border p-5',
                result.correct
                  ? 'border-dynamic-green/25 bg-dynamic-green/10'
                  : 'border-dynamic-orange/25 bg-dynamic-orange/10'
              )}
            >
              <p className="font-bold text-2xl tracking-normal">
                {result.correct
                  ? t('practice.correct')
                  : t('practice.incorrect')}
              </p>
              <p className="mt-2 text-muted-foreground">
                {t('practice.resultSummary', {
                  hearts: result.hearts,
                  xp: result.xpAwarded,
                })}
              </p>
            </div>
          ) : null}
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <Button
              className="h-12 rounded-full bg-dynamic-green text-primary-foreground hover:bg-dynamic-green/90"
              disabled={submit.isPending}
              onClick={() => submit.mutate(true)}
            >
              <Check className="h-4 w-4" />
              {t('practice.submitCorrect')}
            </Button>
            <Button
              className="h-12 rounded-full"
              disabled={submit.isPending}
              onClick={() => submit.mutate(false)}
              variant="secondary"
            >
              {t('practice.submitIncorrect')}
            </Button>
          </div>
        </div>
        <aside className="space-y-3" data-tulearn-reveal>
          <PracticeHint
            icon={Heart}
            label={t('home.hearts')}
            value={result ? String(result.hearts) : t('practice.keepHearts')}
          />
          <PracticeHint
            icon={Sparkles}
            label={t('home.xp')}
            value={
              result
                ? t('practice.xpAwardedValue', { xp: result.xpAwarded })
                : t('practice.xpHint')
            }
          />
          <PracticeHint
            icon={Zap}
            label={t('practice.again')}
            value={t('practice.retryHint')}
          />
        </aside>
      </div>
    </Section>
  );
}

function PracticeHint({
  icon: Icon,
  label,
  value,
}: {
  icon: IconComponent;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[1.75rem] border border-border bg-card p-5">
      <Icon className="mb-4 h-6 w-6 text-dynamic-green" />
      <p className="text-muted-foreground text-sm">{label}</p>
      <p className="mt-1 font-bold text-xl tracking-normal">{value}</p>
    </div>
  );
}
