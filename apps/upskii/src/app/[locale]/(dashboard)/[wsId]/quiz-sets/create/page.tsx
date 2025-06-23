import QuizSetForm from "@/components/quiz/quiz-set-form";

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function Page({ params }: Props) {
  const { wsId } = await params;
  return (
    <div>
      <QuizSetForm wsId={wsId} />
    </div>
  );
}
