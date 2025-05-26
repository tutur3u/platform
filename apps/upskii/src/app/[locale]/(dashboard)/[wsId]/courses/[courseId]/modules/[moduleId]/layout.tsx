import {
  createClient,
  createDynamicClient,
} from '@tuturuuu/supabase/next/server';
import { WorkspaceCourseModule } from '@tuturuuu/types/db';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import {
  BookText,
  Box,
  CheckCircle,
  Eye,
  Goal,
  ListTodo,
  Paperclip,
  SquareCheck,
  SwatchBook,
  XIcon,
  Youtube
} from '@tuturuuu/ui/icons';
import { Separator } from '@tuturuuu/ui/separator';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { ReactNode } from 'react';
import LinkButton from '../../link-button';
import ModuleToggles from './toggles';

interface Props {
  children: ReactNode;
  params: Promise<{
    locale: string;
    wsId: string;
    courseId: string;
    moduleId: string;
  }>;
}

export default async function CourseDetailsLayout({ children, params }: Props) {
  const t = await getTranslations();
  const { wsId, courseId, moduleId } = await params;
  const commonHref = `/${wsId}/courses/${courseId}/modules/${moduleId}`;

  const data = await getData(courseId, moduleId);
  const resources = await getResources({
    path: `${wsId}/courses/${courseId}/modules/${moduleId}/resources/`,
  });
  const completionStatus = await getCompletionStatus(moduleId);

  const flashcards = await getFlashcards(moduleId);
  const quizSets = await getQuizSets(moduleId);
  const quizzes = await getQuizzes(moduleId);

  return (
    <>
      <FeatureSummary
        title={
          <>
            <h1 className="flex  justify-between w-full items-center gap-2 text-2xl font-bold">
              <div className="flex items-center gap-2">
                <div className="border-dynamic-purple/20 bg-dynamic-purple/10 text-dynamic-purple flex items-center gap-2 rounded-lg border px-2 text-lg max-md:hidden">
                  <Box className="h-6 w-6" />
                  {t('ws-course-modules.singular')}
                </div>
              <div className="line-clamp-1 text-lg font-bold md:text-2xl">
                {data.name || t('common.unknown')}
              </div>
              </div>
              {/* Currently the not completed text is only displayed for testing purposes, I plan to only display the completed icon when the module is completed */}
                {completionStatus ? 
                <div className="border-dynamic-green/20 bg-dynamic-green/10 text-dynamic-green flex items-center gap-2 rounded-lg border px-2 py-1 text-base"> 
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  <span className="text-green-500">{t('common.completed')}</span>
                </div>
                :
                <div className="border-dynamic-red/20 bg-dynamic-red/10 text-dynamic-red flex items-center gap-2 rounded-lg border px-2 py-1 text-sm sm:text-base"> 
                  <XIcon className="h-5 w-5 text-red-500" />
                  <span className="text-red-500">{t('common.not_completed')}</span>
                </div>
                }
            </h1>
            <ModuleToggles
              courseId={courseId}
              moduleId={moduleId}
              isPublic={data.is_public}
              isPublished={data.is_published}
            />
            <Separator className="my-2" />
          </>
        }
        description={
          <>
            <div className="grid flex-wrap gap-2 md:flex">
              <LinkButton
                href={`${commonHref}`}
                title={t('course-details-tabs.preview')}
                icon={<Eye className="h-5 w-5" />}
                className="border-foreground/20 bg-foreground/10 text-foreground hover:bg-foreground/20"
              />
              <LinkButton
                href={`${commonHref}/content`}
                title={t('course-details-tabs.module_content')}
                icon={<Goal className="h-5 w-5" />}
                className="border-dynamic-blue/20 bg-dynamic-blue/10 text-dynamic-blue hover:bg-dynamic-blue/20"
              />
              <LinkButton
                href={`${commonHref}/resources`}
                title={`${t('course-details-tabs.resources')} (${resources.length || 0})`}
                icon={<Paperclip className="h-5 w-5" />}
                className="border-dynamic-purple/20 bg-dynamic-purple/10 text-dynamic-purple hover:bg-dynamic-purple/20"
              />
              <LinkButton
                href={`${commonHref}/youtube-links`}
                title={`${t('course-details-tabs.youtube_links')} (${data.youtube_links?.length || 0})`}
                icon={<Youtube className="h-5 w-5" />}
                className="border-dynamic-red/20 bg-dynamic-red/10 text-dynamic-red hover:bg-dynamic-red/20"
              />
              <LinkButton
                href={`${commonHref}/quiz-sets`}
                title={`${t('ws-quiz-sets.plural')} (${quizSets || 0})`}
                icon={<ListTodo className="h-5 w-5" />}
                className="border-dynamic-lime/20 bg-dynamic-lime/10 text-dynamic-lime hover:bg-dynamic-lime/20"
              />
              <LinkButton
                href={`${commonHref}/quizzes`}
                title={`${t('ws-quizzes.plural')} (${quizzes || 0})`}
                icon={<SquareCheck className="h-5 w-5" />}
                className="border-dynamic-green/20 bg-dynamic-green/10 text-dynamic-green hover:bg-dynamic-green/20"
              />
              <LinkButton
                href={`${commonHref}/flashcards`}
                title={`${t('ws-flashcards.plural')} (${flashcards || 0})`}
                icon={<SwatchBook className="h-5 w-5" />}
                className="border-dynamic-sky/20 bg-dynamic-sky/10 text-dynamic-sky hover:bg-dynamic-sky/20"
              />
              <LinkButton
                href={`${commonHref}/extra-content`}
                title={t('course-details-tabs.extra_reading')}
                icon={<BookText className="h-5 w-5" />}
                className="border-dynamic-orange/20 bg-dynamic-orange/10 text-dynamic-orange hover:bg-dynamic-orange/20"
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

async function getData(courseId: string, moduleId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('workspace_course_modules')
    .select('*')
    .eq('course_id', courseId)
    .eq('id', moduleId)
    .maybeSingle();

  if (error) throw error;
  if (!data) notFound();

  return data as WorkspaceCourseModule;
}

async function getFlashcards(moduleId: string) {
  const supabase = await createClient();

  const { count, error } = await supabase
    .from('course_module_flashcards')
    .select('*', { count: 'exact', head: true })
    .eq('module_id', moduleId);
  if (error) throw error;

  return count;
}

async function getQuizzes(moduleId: string) {
  const supabase = await createClient();

  const { count, error } = await supabase
    .from('course_module_quizzes')
    .select('*', { count: 'exact', head: true })
    .eq('module_id', moduleId);
  if (error) throw error;

  return count;
}

async function getQuizSets(moduleId: string) {
  const supabase = await createClient();

  const { count, error } = await supabase
    .from('course_module_quiz_sets')
    .select('*', { count: 'exact', head: true })
    .eq('module_id', moduleId);
  if (error) throw error;

  return count;
}

async function getResources({ path }: { path: string }) {
  const supabase = await createDynamicClient();

  const { data, error } = await supabase.storage.from('workspaces').list(path);
  if (error) throw error;

  return data;
}


const getCompletionStatus = async (moduleId: string) => {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('User not authenticated');
  }

  // 1. Check if the row exists
  let { data, error } = await supabase
    .from('course_module_completion_status')
    .select('completion_status')
    .eq('module_id', moduleId)
    .eq('user_id', user.id);

  if (error) {
    console.log('error', error);
    return null;
  }

  // 2. If not found, insert a new row
  if (!data || data.length === 0) {
    const { data: insertData, error: insertError } = await supabase
      .from('course_module_completion_status')
      .insert([
        {
          module_id: moduleId,
          user_id: user.id,
          completion_status: false,
        },
      ])
      .select('completion_status'); 

    if (insertError) {
      console.log('insert error', insertError);
      return null;
    }

    return insertData?.[0]?.completion_status;
  }

  // 3. Return the found row(s)
  return data?.[0]?.completion_status;
};

// const updateCompletionStatus = async (moduleId: string) => {
//   const supabase = await createClient();

//   const { data: { user } } = await supabase.auth.getUser();
//   if (!user) {
//     throw new Error('User not authenticated');
//   }

//   const { data, error } = await supabase
//     .from('course_module_completion_status')
//     .update({ completion_status: true })
//     .eq('module_id', moduleId)
//     .eq('user_id', user.id);

//   if (error) {
//     console.error('error', error);
//     return null;
//   }

//   return data;
// };
