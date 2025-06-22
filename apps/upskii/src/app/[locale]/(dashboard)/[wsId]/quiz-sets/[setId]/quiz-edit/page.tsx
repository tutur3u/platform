import QuizForm from '../multi-form';
import { createClient } from '@tuturuuu/supabase/next/server';

interface Props {
  params: Promise<{
    wsId: string;
    setId: string;
  }>;
}

export default async function Page({ params }: Props) {
  const { wsId, setId } = await params;
  const quizData = await getData(setId);

  if (!quizData) {
    <div>
      <p>Error: Failed to load quiz data.</p>
      <p>Please try again later.</p>
    </div>;
  }
  return (
    <div>
      <QuizForm wsId={wsId} setId={setId} data={quizData ?? undefined} isEdit={true} />
    </div>
  );
}
async function getData(setId: string) {
  const supabase = await createClient();

  // Fetch all quizzes for the given setId, including their quiz options
  const { data, error } = await supabase
    .from('quiz_set_quizzes')
    .select('...workspace_quizzes(*, quiz_options(*))', {
      count: 'exact',
    })
    .eq('set_id', setId)
    .order('created_at', { ascending: false });

  if (error || !data) {
    return null;
  }

  return data;
}
