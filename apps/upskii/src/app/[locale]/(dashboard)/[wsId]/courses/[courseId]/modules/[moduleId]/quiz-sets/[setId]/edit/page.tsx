import QuizSetForm from '../../form';
import { createClient } from '@tuturuuu/supabase/next/server';

interface Props {
  params: Promise<{
    wsId: string;
    // courseId: string;
    moduleId: string;
    setId: string;
  }>;
}

export default async function Page({ params }: Props) {
  const { wsId, moduleId, setId } = await params;
  const setDetails = await getQuizSetDetails(setId);

  if (!setDetails) {
    return <div>Error: Quiz set not found</div>;
  }

  return (
    <div>
      <QuizSetForm wsId={wsId} moduleId={moduleId} data={setDetails} />
    </div>
  );
}

async function getQuizSetDetails(setId: string) {
  const supabase = await createClient();

  const queryBuilder = supabase
    .from('workspace_quiz_sets')
    .select('*')
    .eq('id', setId)
    .single();
  const { data, error } = await queryBuilder;

  if (error) {
    console.error('Error fetching quiz set details:', error);
    return null;
  }

  return data;
}
