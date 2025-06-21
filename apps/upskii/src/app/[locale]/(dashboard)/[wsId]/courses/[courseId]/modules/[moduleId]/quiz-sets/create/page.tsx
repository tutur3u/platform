import QuizSetForm from '../form';

interface Props {
  params: Promise<{
    wsId: string;
    courseId: string;
    moduleId: string;
  }>;
}

export default async function Page({ params }: Props) {
  const { wsId, courseId, moduleId } = await params;
  return (
    <div>
      <QuizSetForm wsId={wsId} moduleId={moduleId} />
    </div>
  );
}
