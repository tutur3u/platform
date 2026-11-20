'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Heart, Sparkles, Zap } from '@tuturuuu/icons';
import {
  getTulearnPractice,
  submitTulearnPractice,
} from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { LearnerRequestError } from './learner-request-state';
import { useTranslations } from 'next-intl';
import {
  EmptyState,
  type IconComponent,
  LoadingState,
  Section,
  SurfaceCard,
  SurfaceIcon,
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
  if (practice.isError && !practice.data)
    return <LearnerRequestError retry={() => void practice.refetch()} />;
  if (!practice.data?.item) return <EmptyState label={t('practice.empty')} />;

  const result = submit.data;

  return (
    <Section
      description={t('practice.description')}
      refValue={scopeRef}
      title={t('practice.title')}
    >
      <div className="mx-auto grid max-w-5xl gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <Card>
          <CardHeader>
            <Badge variant="secondary">{practice.data.item.courseName}</Badge>
            <CardTitle className="text-xl">
              {practice.data.item.title}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {practice.data.item.prompt && (
              <p className="text-muted-foreground leading-relaxed">
                {practice.data.item.prompt}
              </p>
            )}
            {result ? (
              <div role="status" className="rounded-lg border p-4">
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
            {submit.isError && (
              <p role="alert" className="text-destructive text-sm">
                {t('learnerWorkspace.practiceError')}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={submit.isPending}
                onClick={() => submit.mutate(true)}
              >
                <Check className="h-4 w-4" />
                {t('practice.submitCorrect')}
              </Button>
              <Button
                disabled={submit.isPending}
                onClick={() => submit.mutate(false)}
                variant="secondary"
              >
                {t('practice.submitIncorrect')}
              </Button>
            </div>
          </CardContent>
        </Card>
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
    <SurfaceCard className="p-5">
      <SurfaceIcon className="mb-4 h-10 w-10" icon={Icon} />
      <p className="text-muted-foreground text-sm">{label}</p>
      <p className="mt-1 font-bold text-xl tracking-normal">{value}</p>
    </SurfaceCard>
  );
}
