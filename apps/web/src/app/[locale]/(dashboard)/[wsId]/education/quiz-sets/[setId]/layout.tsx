import LinkButton from '../../courses/[courseId]/link-button';
import { createClient } from '@tutur3u/supabase/next/server';
import { type WorkspaceQuizSet } from '@tutur3u/types/db';
import FeatureSummary from '@tutur3u/ui/components/ui/custom/feature-summary';
import { Separator } from '@tutur3u/ui/components/ui/separator';
import { Box, Eye, Paperclip } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  params: Promise<{
    locale: string;
    wsId: string;
    setId: string;
  }>;
}

export default async function QuizSetDetailsLayout({
  children,
  params,
}: Props) {
  const t = await getTranslations();
  const { wsId, setId } = await params;
  const commonHref = `/${wsId}/education/quiz-sets/${setId}`;

  const data = await getData(setId);
  const linkedQuizzes = await getLinkedQuizzes(setId);
  const linkedModules = await getLinkedModules(setId);

  return (
    <>
      <FeatureSummary
        title={
          <>
            <h1 className="flex w-full items-center gap-2 text-2xl font-bold">
              <div className="border-dynamic-purple/20 bg-dynamic-purple/10 text-dynamic-purple flex items-center gap-2 rounded-lg border px-2 text-lg max-md:hidden">
                <Box className="h-6 w-6" />
                {t('ws-quiz-sets.singular')}
              </div>
              <div className="line-clamp-1 text-lg font-bold md:text-2xl">
                {data.name || t('common.unknown')}
              </div>
            </h1>
            <Separator className="my-2" />
          </>
        }
        description={
          <>
            <div className="grid flex-wrap gap-2 md:flex">
              <LinkButton
                href={`${commonHref}`}
                title={`${t('ws-quizzes.plural')} (${linkedQuizzes || 0})`}
                icon={<Eye className="h-5 w-5" />}
                className="border-foreground/20 bg-foreground/10 text-foreground hover:bg-foreground/20"
              />
              <LinkButton
                href={`${commonHref}/linked-modules`}
                title={`${t('quiz-set-data-table.linked_modules')} (${linkedModules || 0})`}
                icon={<Paperclip className="h-5 w-5" />}
                className="border-dynamic-purple/20 bg-dynamic-purple/10 text-dynamic-purple hover:bg-dynamic-purple/20"
              />
            </div>
          </>
        }
      />
      <Separator className="my-4" />
      {children}
    </>
  );
}

async function getData(setId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('workspace_quiz_sets')
    .select('*')
    .eq('id', setId)
    .maybeSingle();

  if (error) throw error;
  if (!data) notFound();

  return data as WorkspaceQuizSet;
}

async function getLinkedQuizzes(setId: string) {
  const supabase = await createClient();

  const { count, error } = await supabase
    .from('quiz_set_quizzes')
    .select('*', { count: 'exact', head: true })
    .eq('set_id', setId);
  if (error) throw error;

  return count;
}

async function getLinkedModules(setId: string) {
  const supabase = await createClient();

  const { count, error } = await supabase
    .from('course_module_quiz_sets')
    .select('*', { count: 'exact', head: true })
    .eq('set_id', setId);
  if (error) throw error;

  return count;
}
