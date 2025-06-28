import MultiQuizzesForm from '@/components/quiz/multi-quizzes-form';

interface Props {
  params: Promise<{
    wsId: string;
    setId: string;
  }>;
}

export default async function Page({ params }: Props) {
  const { wsId, setId } = await params;
  return (
    <div>
      <MultiQuizzesForm wsId={wsId} setId={setId} />
    </div>
  );
}
