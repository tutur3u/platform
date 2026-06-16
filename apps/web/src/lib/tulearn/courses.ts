import type { Json, Tables } from '@tuturuuu/types/supabase';

import { getAdmin } from './db';
import { firstOf } from './helpers';
import { getMatchingPairs } from './quiz-content';
import type { Db } from './types';

type ModuleIdOnly = { module_id: string | null };

interface CourseSummary {
  id: string;
  name: string;
  description: string | null;
  completedModules: number;
  totalModules: number;
  progress: number;
}

interface CourseModuleSummary {
  id: string;
  name: string;
  sort_key: number | null;
  is_published: boolean;
  completed: boolean;
  locked: boolean;
  counts: {
    flashcards: number;
    quizzes: number;
    quizSets: number;
  };
}

interface CourseTestSummary {
  id: string;
  name: string;
  start_at: string | null;
  duration_in_minutes: number | null;
  description: string | null;
  module_ids: string[];
}

interface CourseDetail extends CourseSummary {
  modules: CourseModuleSummary[];
  tests: CourseTestSummary[];
}

type FlashcardJoinRow = {
  workspace_flashcards:
    | Pick<Tables<'workspace_flashcards'>, 'id' | 'front' | 'back'>
    | Pick<Tables<'workspace_flashcards'>, 'id' | 'front' | 'back'>[]
    | null;
};

type QuizJoinRow = {
  workspace_quizzes:
    | (Pick<
        Tables<'workspace_quizzes'>,
        'id' | 'question' | 'type' | 'content' | 'score'
      > & {
        quiz_options?: Array<{
          id: string;
          value: string;
          explanation: string | null;
        }>;
      })
    | (Pick<
        Tables<'workspace_quizzes'>,
        'id' | 'question' | 'type' | 'content' | 'score'
      > & {
        quiz_options?: Array<{
          id: string;
          value: string;
          explanation: string | null;
        }>;
      })[]
    | null;
};

type QuizSetJoinRow = {
  workspace_quiz_sets:
    | Pick<Tables<'workspace_quiz_sets'>, 'id' | 'name'>
    | Pick<Tables<'workspace_quiz_sets'>, 'id' | 'name'>[]
    | null;
};

type LearnerQuiz = Pick<
  Tables<'workspace_quizzes'>,
  'id' | 'question' | 'type' | 'content' | 'score'
> & {
  quiz_options?: Array<{
    explanation: string | null;
    id: string;
    value: string;
  }>;
};

function stableChoiceRank(quizId: string, value: string, index: number) {
  const input = `${quizId}:${value}:${index}`;
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function matchingPromptContent(quizId: string, content: Json | null): Json {
  const pairs = getMatchingPairs(content);
  const choices = pairs
    .map((pair, index) => ({
      rank: stableChoiceRank(quizId, pair.right, index),
      value: pair.right,
    }))
    .sort((a, b) => a.rank - b.rank)
    .map((choice) => choice.value);

  return {
    choices,
    pairs: pairs.map((pair) => ({ left: pair.left })),
  };
}

function sanitizeLearnerQuiz(quiz: LearnerQuiz): LearnerQuiz {
  return {
    ...quiz,
    content:
      quiz.type === 'matching'
        ? matchingPromptContent(quiz.id, quiz.content)
        : quiz.content,
    quiz_options: quiz.quiz_options?.map((option) => ({
      explanation: option.explanation,
      id: option.id,
      value: option.value,
    })),
  };
}

export async function getAssignedCourseIds({
  db,
  studentWorkspaceUserId,
  wsId,
}: {
  db?: Db;
  studentWorkspaceUserId: string;
  wsId: string;
}) {
  const sbAdmin = await getAdmin(db);
  const { data, error } = await sbAdmin
    .from('workspace_user_groups_users')
    .select(
      'group_id, workspace_user_groups!workspace_user_roles_users_role_id_fkey!inner(id, ws_id, archived, is_guest, is_course_published)'
    )
    .eq('user_id', studentWorkspaceUserId)
    .eq('workspace_user_groups.ws_id', wsId)
    .eq('workspace_user_groups.archived', false)
    .eq('workspace_user_groups.is_guest', false)
    .eq('workspace_user_groups.is_course_published', true);

  if (error) throw error;
  return (data ?? []).map((row) => row.group_id);
}

export async function getLearnerCourseSummaries({
  db,
  studentPlatformUserId,
  studentWorkspaceUserId,
  wsId,
}: {
  db?: Db;
  studentPlatformUserId: string;
  studentWorkspaceUserId: string;
  wsId: string;
}): Promise<CourseSummary[]> {
  const sbAdmin = await getAdmin(db);
  const courseIds = await getAssignedCourseIds({
    db: sbAdmin,
    studentWorkspaceUserId,
    wsId,
  });

  if (!courseIds.length) return [];

  const [coursesResult, modulesResult, completionsResult] = await Promise.all([
    sbAdmin
      .from('workspace_user_groups')
      .select('id, name, description')
      .eq('ws_id', wsId)
      .in('id', courseIds)
      .order('name', { ascending: true }),
    sbAdmin
      .from('workspace_course_modules')
      .select('id, group_id')
      .in('group_id', courseIds)
      .eq('is_published', true),
    sbAdmin
      .from('course_module_completion_status')
      .select('module_id')
      .eq('user_id', studentPlatformUserId)
      .eq('completion_status', true),
  ]);

  if (coursesResult.error) throw coursesResult.error;
  if (modulesResult.error) throw modulesResult.error;
  if (completionsResult.error) throw completionsResult.error;

  const completedModuleIds = new Set(
    (completionsResult.data ?? []).map((row) => row.module_id)
  );
  const modulesByCourse = new Map<string, string[]>();
  for (const module of modulesResult.data ?? []) {
    const modules = modulesByCourse.get(module.group_id) ?? [];
    modules.push(module.id);
    modulesByCourse.set(module.group_id, modules);
  }

  return (coursesResult.data ?? []).map((course) => {
    const moduleIds = modulesByCourse.get(course.id) ?? [];
    const completedModules = moduleIds.filter((moduleId) =>
      completedModuleIds.has(moduleId)
    ).length;

    return {
      id: course.id,
      name: course.name,
      description: course.description ?? null,
      completedModules,
      totalModules: moduleIds.length,
      progress: moduleIds.length
        ? Math.round((completedModules / moduleIds.length) * 100)
        : 0,
    };
  });
}

function emptyModuleIdResult() {
  return {
    data: [] as ModuleIdOnly[],
    error: null,
  };
}

function countByModule(rows: ModuleIdOnly[], moduleIds: Set<string>) {
  const map = new Map<string, number>();
  for (const row of rows) {
    if (!row.module_id || !moduleIds.has(row.module_id)) continue;
    map.set(row.module_id, (map.get(row.module_id) ?? 0) + 1);
  }
  return map;
}

export async function getLearnerCourseDetail({
  courseId,
  db,
  studentPlatformUserId,
  studentWorkspaceUserId,
  wsId,
}: {
  courseId: string;
  db?: Db;
  studentPlatformUserId: string;
  studentWorkspaceUserId: string;
  wsId: string;
}): Promise<CourseDetail | null> {
  const sbAdmin = await getAdmin(db);
  const courseIds = await getAssignedCourseIds({
    db: sbAdmin,
    studentWorkspaceUserId,
    wsId,
  });
  if (!courseIds.includes(courseId)) return null;

  const [courseResult, modulesResult] = await Promise.all([
    sbAdmin
      .from('workspace_user_groups')
      .select('id, name, description')
      .eq('ws_id', wsId)
      .eq('id', courseId)
      .maybeSingle(),
    sbAdmin
      .from('workspace_course_modules')
      .select('id, name, sort_key, is_published')
      .eq('group_id', courseId)
      .eq('is_published', true)
      .order('sort_key', { ascending: true }),
  ]);

  if (courseResult.error) throw courseResult.error;
  if (modulesResult.error) throw modulesResult.error;
  if (!courseResult.data) return null;

  const moduleIdList = (modulesResult.data ?? []).map((module) => module.id);
  const moduleIds = new Set(moduleIdList);
  const [completionsResult, flashcards, quizzes, quizSets, testsResult] =
    await Promise.all([
      moduleIdList.length
        ? sbAdmin
            .from('course_module_completion_status')
            .select('module_id')
            .eq('user_id', studentPlatformUserId)
            .eq('completion_status', true)
            .in('module_id', moduleIdList)
        : emptyModuleIdResult(),
      moduleIdList.length
        ? sbAdmin
            .from('course_module_flashcards')
            .select('module_id')
            .in('module_id', moduleIdList)
        : emptyModuleIdResult(),
      moduleIdList.length
        ? sbAdmin
            .from('course_module_quizzes')
            .select('module_id')
            .in('module_id', moduleIdList)
        : emptyModuleIdResult(),
      moduleIdList.length
        ? sbAdmin
            .from('course_module_quiz_sets')
            .select('module_id')
            .in('module_id', moduleIdList)
        : emptyModuleIdResult(),
      sbAdmin
        .from('course_tests')
        .select(
          'id, name, start_at, duration_in_minutes, description, course_test_modules(module_id)'
        )
        .eq('course_id', courseId)
        .eq('is_published', true)
        .order('created_at', { ascending: false }),
    ]);

  if (completionsResult.error) throw completionsResult.error;
  if (flashcards.error) throw flashcards.error;
  if (quizzes.error) throw quizzes.error;
  if (quizSets.error) throw quizSets.error;
  if (testsResult.error) throw testsResult.error;
  const completedModuleIds = new Set(
    (completionsResult.data ?? []).map((row) => row.module_id)
  );

  const flashcardCounts = countByModule(flashcards.data ?? [], moduleIds);
  const quizCounts = countByModule(quizzes.data ?? [], moduleIds);
  const quizSetCounts = countByModule(quizSets.data ?? [], moduleIds);

  let priorIncomplete = false;
  const modules: CourseModuleSummary[] = (modulesResult.data ?? []).map(
    (module) => {
      const completed = completedModuleIds.has(module.id);
      const locked = !module.is_published || priorIncomplete;
      if (!completed && module.is_published) priorIncomplete = true;

      return {
        id: module.id,
        name: module.name,
        sort_key: module.sort_key,
        is_published: module.is_published,
        completed,
        locked,
        counts: {
          flashcards: flashcardCounts.get(module.id) ?? 0,
          quizzes: quizCounts.get(module.id) ?? 0,
          quizSets: quizSetCounts.get(module.id) ?? 0,
        },
      };
    }
  );

  const completedModules = modules.filter((module) => module.completed).length;

  const tests = (testsResult.data ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    start_at: t.start_at,
    duration_in_minutes: t.duration_in_minutes,
    description: t.description,
    module_ids: (
      (t.course_test_modules as { module_id: string }[] | undefined) ?? []
    )
      .map((m) => m.module_id)
      .filter((moduleId) => moduleIds.has(moduleId)),
  }));

  return {
    id: courseResult.data.id,
    name: courseResult.data.name,
    description: courseResult.data.description ?? null,
    completedModules,
    totalModules: modules.length,
    progress: modules.length
      ? Math.round((completedModules / modules.length) * 100)
      : 0,
    modules,
    tests,
  };
}

export async function getLearnerModuleDetail({
  courseId,
  db,
  moduleId,
  studentPlatformUserId,
  studentWorkspaceUserId,
  wsId,
}: {
  courseId: string;
  db?: Db;
  moduleId: string;
  studentPlatformUserId: string;
  studentWorkspaceUserId: string;
  wsId: string;
}) {
  const course = await getLearnerCourseDetail({
    courseId,
    db,
    studentPlatformUserId,
    studentWorkspaceUserId,
    wsId,
  });
  if (!course) return null;

  const summary = course.modules.find((module) => module.id === moduleId);
  if (!summary || summary.locked) return null;

  const sbAdmin = await getAdmin(db);
  const [moduleResult, flashcardsResult, quizzesResult, quizSetsResult] =
    await Promise.all([
      sbAdmin
        .from('workspace_course_modules')
        .select('content, extra_content, youtube_links')
        .eq('id', moduleId)
        .eq('group_id', courseId)
        .maybeSingle(),
      sbAdmin
        .from('course_module_flashcards')
        .select('workspace_flashcards(id, front, back)')
        .eq('module_id', moduleId),
      sbAdmin
        .from('course_module_quizzes')
        .select(
          'workspace_quizzes(id, question, type, content, score, quiz_options(id, value, explanation))'
        )
        .eq('module_id', moduleId),
      sbAdmin
        .from('course_module_quiz_sets')
        .select('workspace_quiz_sets(id, name)')
        .eq('module_id', moduleId),
    ]);

  if (moduleResult.error) throw moduleResult.error;
  if (flashcardsResult.error) throw flashcardsResult.error;
  if (quizzesResult.error) throw quizzesResult.error;
  if (quizSetsResult.error) throw quizSetsResult.error;
  if (!moduleResult.data) return null;

  const flashcardRows = (flashcardsResult.data ?? []) as FlashcardJoinRow[];
  const quizRows = (quizzesResult.data ?? []) as QuizJoinRow[];
  const quizSetRows = (quizSetsResult.data ?? []) as QuizSetJoinRow[];

  const rawQuizzes = quizRows
    .map((row) => firstOf(row.workspace_quizzes))
    .filter((value): value is NonNullable<typeof value> => Boolean(value));

  return {
    ...summary,
    content: moduleResult.data.content,
    extra_content: moduleResult.data.extra_content,
    youtube_links: moduleResult.data.youtube_links,
    flashcards: flashcardRows
      .map((row) => firstOf(row.workspace_flashcards))
      .filter((value): value is NonNullable<typeof value> => Boolean(value)),
    quizzes: rawQuizzes.map(sanitizeLearnerQuiz),
    quizSets: quizSetRows
      .map((row) => firstOf(row.workspace_quiz_sets))
      .filter((value): value is NonNullable<typeof value> => Boolean(value)),
  };
}

export async function getRecommendedPracticeItem({
  db,
  studentPlatformUserId,
  studentWorkspaceUserId,
  wsId,
}: {
  db?: Db;
  studentPlatformUserId: string;
  studentWorkspaceUserId: string;
  wsId: string;
}) {
  const courses = await getLearnerCourseSummaries({
    db,
    studentPlatformUserId,
    studentWorkspaceUserId,
    wsId,
  });
  for (const course of courses) {
    const detail = await getLearnerCourseDetail({
      courseId: course.id,
      db,
      studentPlatformUserId,
      studentWorkspaceUserId,
      wsId,
    });
    const module =
      detail?.modules.find(
        (candidate) => !candidate.completed && !candidate.locked
      ) ?? detail?.modules.find((candidate) => !candidate.locked);

    if (detail && module) {
      return {
        type: 'module' as const,
        id: module.id,
        title: module.name,
        courseId: detail.id,
        courseName: detail.name,
        prompt: detail.description,
      };
    }
  }

  return null;
}
