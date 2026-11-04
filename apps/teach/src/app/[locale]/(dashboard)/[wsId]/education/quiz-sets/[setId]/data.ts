import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type {
  WorkspaceCourseModule,
  WorkspaceQuiz,
  WorkspaceQuizSet,
} from '@tuturuuu/types';
import { notFound } from 'next/navigation';
import { requireEducationPageAccess } from '@/lib/education-page-access';
import { checkWorkspaceQuizSet } from '@/lib/quiz-module-access';

export interface QuizSetListParams {
  q?: string;
  page?: string;
  pageSize?: string;
}

async function getAdminClient() {
  return (await createAdminClient()) as TypedSupabaseClient;
}

function getRange(page: string, pageSize: string) {
  const parsedPage = Number.parseInt(page, 10);
  const size = Number.parseInt(pageSize, 10);
  return { start: (parsedPage - 1) * size, end: parsedPage * size, size };
}

/**
 * Link tables (`quiz_set_quizzes`, `course_module_quiz_sets`) have no workspace
 * column, and these pages read them with the admin client. Every read keyed by
 * `setId` must first prove the set belongs to the route workspace. Next renders
 * the layout and page in parallel, so each entry point checks independently.
 */
async function requireQuizSetInWorkspace(
  supabase: TypedSupabaseClient,
  wsId: string,
  setId: string
) {
  const result = await checkWorkspaceQuizSet(supabase, wsId, setId);
  if (result === 'error') throw new Error('Failed to validate quiz set');
  if (result === 'not_found') notFound();
}

export async function getQuizSetSummary(wsId: string, setId: string) {
  await requireEducationPageAccess(wsId);
  const supabase = await getAdminClient();

  const { data, error } = await supabase
    .from('workspace_quiz_sets')
    .select('*')
    .eq('id', setId)
    .eq('ws_id', wsId)
    .maybeSingle();

  if (error) throw error;
  if (!data) notFound();

  const [quizzes, modules] = await Promise.all([
    supabase
      .from('quiz_set_quizzes')
      .select('*', { count: 'exact', head: true })
      .eq('set_id', setId),
    supabase
      .from('course_module_quiz_sets')
      .select('*', { count: 'exact', head: true })
      .eq('set_id', setId),
  ]);
  if (quizzes.error) throw quizzes.error;
  if (modules.error) throw modules.error;

  return {
    set: data as WorkspaceQuizSet,
    linkedQuizzes: quizzes.count,
    linkedModules: modules.count,
  };
}

export async function getQuizSetQuizzes(
  wsId: string,
  setId: string,
  { q, page = '1', pageSize = '10' }: QuizSetListParams = {}
) {
  await requireEducationPageAccess(wsId);
  const supabase = await getAdminClient();
  await requireQuizSetInWorkspace(supabase, wsId, setId);

  const queryBuilder = supabase
    .from('quiz_set_quizzes')
    .select('...workspace_quizzes!inner(*, quiz_options(*))', {
      count: 'exact',
    })
    .eq('set_id', setId)
    .eq('workspace_quizzes.ws_id', wsId)
    .order('created_at', { ascending: false });

  if (q) queryBuilder.ilike('workspace_quizzes.question', `%${q}%`);
  const { start, end, size } = getRange(page, pageSize);
  queryBuilder.range(start, end).limit(size);

  const { data, error, count } = await queryBuilder;
  if (error) throw error;

  return { data, count } as { data: WorkspaceQuiz[]; count: number };
}

export async function getQuizSetLinkedModules(
  wsId: string,
  setId: string,
  { q, page = '1', pageSize = '10' }: QuizSetListParams = {}
) {
  await requireEducationPageAccess(wsId);
  const supabase = await getAdminClient();
  await requireQuizSetInWorkspace(supabase, wsId, setId);

  const queryBuilder = supabase
    .from('course_module_quiz_sets')
    .select(
      'id:module_id, ...workspace_course_modules!inner(group_id, name, is_public, is_published, ...workspace_user_groups!inner(module_ws_id:ws_id))',
      { count: 'exact' }
    )
    .eq('set_id', setId)
    .eq('workspace_course_modules.workspace_user_groups.ws_id', wsId)
    .order('created_at', { ascending: false });

  if (q) queryBuilder.ilike('workspace_course_modules.name', `%${q}%`);
  const { start, end, size } = getRange(page, pageSize);
  queryBuilder.range(start, end).limit(size);

  const { data, error, count } = await queryBuilder;
  if (error) throw error;

  return { data, count } as {
    data: Partial<WorkspaceCourseModule>[];
    count: number;
  };
}

export async function getWorkspaceModules(
  wsId: string,
  { q, page = '1', pageSize = '10' }: QuizSetListParams = {}
) {
  await requireEducationPageAccess(wsId);
  const supabase = await getAdminClient();

  const queryBuilder = supabase
    .from('workspace_course_modules')
    .select(
      'id, name, is_public, is_published, workspace_user_groups!inner(ws_id)',
      { count: 'exact' }
    )
    .eq('workspace_user_groups.ws_id', wsId)
    .order('created_at', { ascending: false });

  if (q) queryBuilder.ilike('name', `%${q}%`);
  const { start, end, size } = getRange(page, pageSize);
  queryBuilder.range(start, end).limit(size);

  const { data, error, count } = await queryBuilder;
  if (error) throw error;

  return { data, count } as {
    data: Partial<WorkspaceCourseModule>[];
    count: number;
  };
}
