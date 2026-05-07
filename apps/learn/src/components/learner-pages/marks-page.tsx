'use client';

import { useQuery } from '@tanstack/react-query';
import { listTulearnMarks } from '@tuturuuu/internal-api';
import { useTranslations } from 'next-intl';
import { MarkCard } from './mark-card';
import {
  EmptyState,
  LoadingState,
  Section,
  usePageMotion,
  useStudentId,
} from './shared';

export function MarksPage({ wsId }: { wsId: string }) {
  const t = useTranslations();
  const studentId = useStudentId();
  const scopeRef = usePageMotion();
  const marks = useQuery({
    queryFn: () => listTulearnMarks(wsId, studentId),
    queryKey: ['tulearn', wsId, studentId, 'marks'],
  });

  if (marks.isLoading) return <LoadingState />;

  return (
    <Section
      description={t('marks.description')}
      refValue={scopeRef}
      title={t('marks.title')}
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {marks.data?.marks.map((mark, index) => (
          <MarkCard index={index} key={mark.id} mark={mark} />
        ))}
      </div>
      {!marks.data?.marks.length ? (
        <EmptyState label={t('marks.empty')} />
      ) : null}
    </Section>
  );
}
