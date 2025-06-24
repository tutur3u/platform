import QuizSetForm from '@/components/quiz/quiz-set-form';
import { createClient } from '@tuturuuu/supabase/next/server';

interface Props {
  params: Promise<{
    wsId: string;
    setId: string;
  }>;
}

export default async function Page({ params }: Props) {
  const { wsId, setId } = await params;
  const setDetails = await getQuizSetDetails(setId);

  console.log('Quiz Set Details:', setDetails);

  if (!setDetails) {
    return <div>Error: Quiz set not found</div>;
  }

  return (
    <div>
      <QuizSetForm
        wsId={wsId}
        moduleId={setDetails.moduleId}
        data={setDetails}
      />
    </div>
  );
}

async function getQuizSetDetails(setId: string) {
  const supabase = await createClient();

  const queryBuilder = supabase
    .from('workspace_quiz_sets')
    .select('*, course_module_quiz_sets(module_id)')
    .eq('id', setId)
    .single();
  const { data, error } = await queryBuilder;

  if (error) {
    console.error('Error fetching quiz set details:', error);
    return null;
  }

  return {
    ...data,
    id: data?.id,
    name: data?.name ?? '',
    moduleId: data?.course_module_quiz_sets?.[0]?.module_id ?? undefined,
    attemptLimit: data?.attempt_limit ?? null,
    timeLimitMinutes: data?.time_limit_minutes ?? null,
    allowViewResults: data?.allow_view_results ?? true,
    availableDate: data?.available_date
      ? data.available_date.toString().slice(0, 16)
      : '',
    dueDate: data?.due_date ? data.due_date.toString().slice(0, 16) : '',
    explanationMode: data?.explanation_mode ?? 0,
    instruction: data?.instruction ?? null,
    resultsReleased: data?.results_released ?? false,
    allowViewOldAttempts: data?.allow_view_old_attempts ?? true,
  };
}
