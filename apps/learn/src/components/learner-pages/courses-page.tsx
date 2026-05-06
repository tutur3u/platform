'use client';

import { useQuery } from '@tanstack/react-query';
import { listTulearnCourses } from '@tuturuuu/internal-api';
import { useTranslations } from 'next-intl';
import { CourseCard } from './course-card';
import {
  EmptyState,
  LoadingState,
  Section,
  usePageMotion,
  useStudentId,
} from './shared';

export function CoursesPage({ wsId }: { wsId: string }) {
  const t = useTranslations();
  const studentId = useStudentId();
  const scopeRef = usePageMotion();
  const courses = useQuery({
    queryFn: () => listTulearnCourses(wsId, studentId),
    queryKey: ['tulearn', wsId, studentId, 'courses'],
  });

  if (courses.isLoading) return <LoadingState />;

  return (
    <Section
      description={t('courses.mapDescription')}
      refValue={scopeRef}
      title={t('courses.title')}
    >
      <div className="space-y-4">
        {courses.data?.courses.map((course, index) => (
          <CourseCard course={course} index={index} key={course.id} />
        ))}
      </div>
      {!courses.data?.courses.length ? (
        <EmptyState label={t('courses.empty')} />
      ) : null}
    </Section>
  );
}
