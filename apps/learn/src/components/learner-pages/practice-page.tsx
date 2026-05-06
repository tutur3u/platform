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
  BrutalCard,
  BrutalIcon,
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
        <BrutalCard className="bg-background p-6 md:p-8">
          <Badge className="mb-5 rounded-none border-2 border-foreground bg-dynamic-yellow text-foreground hover:bg-dynamic-yellow">
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
                'mt-8 border-2 border-foreground p-5 shadow-[5px_5px_0_var(--foreground)]',
                result.correct ? 'bg-dynamic-yellow/20' : 'bg-background'
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
              className="h-12 rounded-none border-2 border-foreground bg-dynamic-yellow font-black text-foreground shadow-[4px_4px_0_var(--foreground)] hover:bg-dynamic-yellow active:translate-x-1 active:translate-y-1 active:shadow-none"
              disabled={submit.isPending}
              onClick={() => submit.mutate(true)}
            >
              <Check className="h-4 w-4" />
              {t('practice.submitCorrect')}
            </Button>
            <Button
              className="h-12 rounded-none border-2 border-foreground font-black shadow-[4px_4px_0_var(--foreground)] active:translate-x-1 active:translate-y-1 active:shadow-none"
              disabled={submit.isPending}
              onClick={() => submit.mutate(false)}
              variant="secondary"
            >
              {t('practice.submitIncorrect')}
            </Button>
          </div>
        </BrutalCard>
        <aside className="space-y-3" data-learn-reveal>
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
    <BrutalCard className="p-5">
      <BrutalIcon className="mb-4 h-10 w-10" icon={Icon} />
      <p className="text-muted-foreground text-sm">{label}</p>
      <p className="mt-1 font-bold text-xl tracking-normal">{value}</p>
    </BrutalCard>
  );
}
