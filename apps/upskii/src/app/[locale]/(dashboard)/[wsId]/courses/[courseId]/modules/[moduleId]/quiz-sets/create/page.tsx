import QuizSetForm from '@/components/quiz/quiz-set-form';

interface Props {
  params: Promise<{
    wsId: string;
    moduleId: string;
  }>;
}

export default async function Page({ params }: Props) {
  const { wsId, moduleId } = await params;
  return (
    <div>
      <QuizSetForm wsId={wsId} moduleId={moduleId} />
    </div>
  );
}
