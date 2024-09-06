import Quizzes from '../quizzes';
import { Quiz } from '@/types/db';
import { createAdminClient } from '@/utils/supabase/server';
import { notFound } from 'next/navigation';

export default async function QuizzesPage() {
  const quizzes = await getQuizzes();

  return (
    <div className="h-full p-4 lg:p-0">
      <Quizzes quizzes={quizzes} />
    </div>
  );
}

const getQuizzes = async () => {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('quizzes')
    .select('*')
    .eq('is_public', true);

  if (error) {
    console.error(error);
    notFound();
  }

  return data as Quiz[];
};
