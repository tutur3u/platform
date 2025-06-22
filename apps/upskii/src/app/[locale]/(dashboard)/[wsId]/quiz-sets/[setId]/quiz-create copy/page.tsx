import QuizForm from '../multi-form';

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
      <QuizForm wsId={wsId} setId={setId} />
    </div>
  );
}
