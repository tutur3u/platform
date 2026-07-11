import { LessonVocabularyPage as VocabularyPage } from '@/components/vocabulary/lesson-vocabulary-page';

export default async function CourseLessonVocabularyPage({
  params,
}: {
  params: Promise<{
    courseId: string;
    lessonId: string;
    locale: string;
    wsId: string;
  }>;
}) {
  const { courseId, lessonId, locale, wsId } = await params;
  return (
    <VocabularyPage
      backHref={`/${wsId}/courses/${courseId}/${lessonId}`}
      bootstrapSource="teach"
      fallbackHref="courses"
      locale={locale}
      loginNext={`/${wsId}/courses/${courseId}/${lessonId}/vocabulary`}
      moduleId={lessonId}
      wsId={wsId}
    />
  );
}
