import TakingQuizClient from "@/app/[locale]/(dashboard)/[wsId]/courses/[courseId]/modules/[moduleId]/quiz-sets/[setId]/take/taking-quiz-client";


export default async function TakeQuiz({
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
    <TakingQuizClient
      wsId={wsId}
      courseId={courseId}
      moduleId={moduleId}
      setId={setId}
    />
  );
}
