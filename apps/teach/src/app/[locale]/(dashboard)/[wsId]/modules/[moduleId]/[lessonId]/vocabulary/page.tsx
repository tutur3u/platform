import { LessonVocabularyPage as VocabularyPage } from '@/components/vocabulary/lesson-vocabulary-page';

export default async function LessonVocabularyPage({
  params,
}: {
  params: Promise<{
    lessonId: string;
    locale: string;
    moduleId: string;
    wsId: string;
  }>;
}) {
  const { lessonId, locale, moduleId, wsId } = await params;
  return (
    <VocabularyPage
      backHref={`/${wsId}/modules/${moduleId}/${lessonId}`}
      bootstrapSource="tulearn"
      fallbackHref="modules"
      locale={locale}
      loginNext={`/${wsId}/modules/${moduleId}/${lessonId}/vocabulary`}
      moduleId={moduleId}
      wsId={wsId}
    />
  );
}
