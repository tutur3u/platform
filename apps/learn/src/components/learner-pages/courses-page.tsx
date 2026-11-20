'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowRight, BookOpen, Library } from '@tuturuuu/icons';
import {
  getTulearnCourse,
  listTulearnCourses,
  type TulearnCourseSummary,
} from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Progress } from '@tuturuuu/ui/progress';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { LearnerRequestError } from './learner-request-state';
import {
  EmptyState,
  LoadingState,
  Section,
  useStudentHref,
  useStudentId,
} from './shared';

export function CoursesPage({ wsId }: { wsId: string }) {
  const t = useTranslations();
  const studentId = useStudentId();
  const search = useSearchParams();
  const library = search.get('view') === 'library';
  const coursesHref = useStudentHref(`/${wsId}/courses`);
  const libraryHref = useStudentHref(`/${wsId}/courses?view=library`);
  const courses = useQuery({
    enabled: Boolean(wsId),
    queryFn: () => listTulearnCourses(wsId, studentId),
    queryKey: ['tulearn', wsId, studentId, 'courses'],
  });
  const catalog = courses.data?.courses ?? [];
  const selectedCourseId = search.get('courseId');
  const selectedCourse =
    library && catalog.find((course) => course.id === selectedCourseId);

  return (
    <Section
      title={library ? t('learnerWorkspace.library') : t('courses.title')}
    >
      <nav
        aria-label={t('courses.title')}
        className="mb-4 flex flex-wrap gap-2"
      >
        <Button asChild variant={library ? 'outline' : 'default'}>
          <Link aria-current={!library ? 'page' : undefined} href={coursesHref}>
            <BookOpen aria-hidden />
            {t('courses.title')}
          </Link>
        </Button>
        <Button asChild variant={library ? 'default' : 'outline'}>
          <Link aria-current={library ? 'page' : undefined} href={libraryHref}>
            <Library aria-hidden />
            {t('learnerWorkspace.library')}
          </Link>
        </Button>
      </nav>
      {courses.isPending ? (
        <LoadingState />
      ) : courses.isError && !courses.data ? (
        <LearnerRequestError retry={() => void courses.refetch()} />
      ) : !catalog.length ? (
        <EmptyState label={t('courses.empty')} />
      ) : selectedCourse ? (
        <LibraryModules course={selectedCourse} wsId={wsId} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {catalog.map((course) => (
            <LearnerCourseCard
              course={course}
              key={course.id}
              library={library}
              wsId={wsId}
            />
          ))}
        </div>
      )}
    </Section>
  );
}

function LearnerCourseCard({
  course,
  library,
  wsId,
}: {
  course: TulearnCourseSummary;
  library: boolean;
  wsId: string;
}) {
  const t = useTranslations();
  const href = useStudentHref(
    library
      ? `/${wsId}/courses?view=library&courseId=${encodeURIComponent(course.id)}`
      : `/${wsId}/courses/${course.id}`
  );
  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle className="break-words">{course.name}</CardTitle>
        {course.description && (
          <p className="line-clamp-2 text-muted-foreground text-sm">
            {course.description}
          </p>
        )}
      </CardHeader>
      <CardContent className="mt-auto space-y-4">
        <div className="space-y-2">
          <div className="flex justify-between gap-2 text-muted-foreground text-sm">
            <span>
              {t('courses.modules')} {course.completedModules}/
              {course.totalModules}
            </span>
            <span>{course.progress}%</span>
          </div>
          <Progress
            aria-label={t('home.learningPath')}
            value={course.progress}
          />
        </div>
        <Button asChild variant="outline">
          <Link href={href}>
            {library
              ? t('learnerWorkspace.openMaterials')
              : t('home.continueCourse')}
            <ArrowRight aria-hidden />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function LibraryModules({
  course,
  wsId,
}: {
  course: TulearnCourseSummary;
  wsId: string;
}) {
  const t = useTranslations();
  const studentId = useStudentId();
  const libraryHref = useStudentHref(`/${wsId}/courses?view=library`);
  const courseHref = useStudentHref(`/${wsId}/courses/${course.id}`);
  const detail = useQuery({
    queryFn: () => getTulearnCourse(wsId, course.id, studentId),
    queryKey: ['tulearn', wsId, studentId, 'course', course.id],
  });
  if (detail.isPending) return <LoadingState />;
  if (detail.isError && !detail.data)
    return <LearnerRequestError retry={() => void detail.refetch()} />;
  const modules = detail.data?.modules.filter((item) => !item.locked) ?? [];
  return (
    <Card>
      <CardHeader className="flex flex-wrap items-start justify-between gap-3">
        <CardTitle>{course.name}</CardTitle>
        <Button asChild size="sm" variant="outline">
          <Link href={libraryHref}>{t('learnerWorkspace.library')}</Link>
        </Button>
      </CardHeader>
      <CardContent>
        {modules.length ? (
          <ul className="divide-y divide-border">
            {modules.map((item) => (
              <li
                className="flex flex-wrap items-center justify-between gap-2 py-3"
                key={item.id}
              >
                <Link
                  className="font-medium hover:underline"
                  href={`${courseHref}${courseHref.includes('?') ? '&' : '?'}moduleId=${encodeURIComponent(item.id)}`}
                >
                  {item.name}
                </Link>
                {item.counts.flashcards > 0 && (
                  <Badge variant="secondary">
                    {t('learnerWorkspace.flashcardCount', {
                      count: item.counts.flashcards,
                    })}
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">
            {t('learnerWorkspace.noMaterials')}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
