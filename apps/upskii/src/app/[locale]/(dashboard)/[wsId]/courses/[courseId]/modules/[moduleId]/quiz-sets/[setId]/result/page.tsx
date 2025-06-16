import QuizResultClient from '@/app/[locale]/(dashboard)/[wsId]/courses/[courseId]/modules/[moduleId]/quiz-sets/[setId]/result/quiz-result-client';

export default async function QuizResultPage({
  params,
}: {
  params: Promise<{
    wsId: string;
    courseId: string;
    moduleId: string;
    setId: string;
  }>;
}) {
  const { wsId, courseId, moduleId, setId } = await params;
  return (
    <QuizResultClient
      wsId={wsId}
      courseId={courseId}
      moduleId={moduleId}
      setId={setId}
    />
  );
}
